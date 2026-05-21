// HILUX draft-reply edge function. The vendor taps "Draft with HILUX"
// in the inquiry composer; we generate a HILUX-voice draft using the
// same system prompt as the always-on agent and return it so the
// vendor can edit/send manually.
//
// Auth: vendor JWT (verify_jwt=true). Ownership: we verify the
// caller is a member of the thread's vendor team via service role.
// No DB writes happen here — just a Claude call and a string back.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  buildSystemPrompt,
  callClaude,
  DEFAULT_ACTIONS,
  loadVendorContext,
  priceUsd,
} from "../_shared/hilux-prompt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const HISTORY_LIMIT = 20;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return json(401, { error: "missing_authorization" });
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: "invalid_session" });

    const payload = await req.json().catch(() => ({}));
    const threadId = String(payload?.thread_id ?? "").trim();
    if (!threadId) return json(400, { error: "missing_thread_id" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: thread } = await admin
      .from("direct_threads")
      .select("id, vendor_id, host_id, inquiry_id")
      .eq("id", threadId)
      .maybeSingle();
    if (!thread) return json(404, { error: "thread_not_found" });

    // Vendor-team membership check. RLS already gates direct_threads
    // SELECT to participants, but the user might be the HOST on this
    // thread — we want vendor-side only.
    const { data: membership } = await admin
      .from("vendor_team_members")
      .select("user_id")
      .eq("vendor_id", thread.vendor_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!membership) return json(403, { error: "not_a_vendor_member" });

    const ctx = await loadVendorContext(admin, thread.vendor_id);
    if (!ctx.vendor) return json(404, { error: "vendor_not_found" });

    // Pull recent history to seed the draft. We DO include the
    // latest message regardless of who sent it — vendors call this
    // to draft replies from any conversation point.
    const { data: history } = await admin
      .from("direct_messages")
      .select("sender_role, body, created_at, is_hilux_generated")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    const orderedHistory = ((history ?? []) as Array<{
      sender_role: string;
      body: string;
      is_hilux_generated: boolean;
    }>).slice().reverse();
    if (
      orderedHistory.length === 0 ||
      orderedHistory[orderedHistory.length - 1].sender_role !== "host"
    ) {
      return json(400, { error: "no_host_message_to_reply_to" });
    }
    const claudeMessages = orderedHistory.map((m) => ({
      role: (m.sender_role === "host" ? "user" : "assistant") as "user" | "assistant",
      content: m.body,
    }));

    let inquiryCtx: any = null;
    if (thread.inquiry_id) {
      const { data: inq } = await admin
        .from("inquiries")
        .select(
          "event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests",
        )
        .eq("id", thread.inquiry_id)
        .maybeSingle();
      if (inq) {
        const min = priceUsd(inq.budget_min_cents);
        const max = priceUsd(inq.budget_max_cents);
        const range = min && max ? `${min}–${max}` : min ?? max ?? null;
        inquiryCtx = {
          eventType: inq.event_type,
          eventDate: inq.event_date,
          guestCount: inq.guest_count,
          location: inq.location,
          budgetRangeUsd: range,
          specialRequests: inq.special_requests,
        };
      }
    }

    let hostFirstName: string | null = null;
    const actions = ctx.profile?.actions ?? DEFAULT_ACTIONS;
    if (actions.useFirstName && thread.host_id) {
      const { data: hostProfile } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", thread.host_id)
        .maybeSingle();
      const raw =
        (hostProfile as { display_name?: string } | null)?.display_name?.trim() ??
        "";
      hostFirstName = raw.length > 0 ? raw.split(/\s+/)[0] : null;
    }

    const systemText = buildSystemPrompt({
      businessName: ctx.vendor.business_name ?? "this vendor",
      category: ctx.vendor.category,
      bio: ctx.vendor.bio,
      location: ctx.vendor.location,
      startingPriceUsd: priceUsd(ctx.vendor.base_price_cents),
      customInstructions: ctx.profile?.hilux_instructions ?? null,
      voiceSamples: ctx.profile?.hilux_voice_samples ?? [],
      packages: ctx.packages,
      faqs: ctx.faqs,
      inquiry: inquiryCtx,
      availability: ctx.availability,
      actions,
      hostFirstName,
      isFirstReply: !orderedHistory.some((m) => m.is_hilux_generated === true),
    });

    const reply = await callClaude(ANTHROPIC_API_KEY, systemText, claudeMessages);
    // Strip ESCALATE token if HILUX would have escalated — vendor
    // still wants the draft text.
    const sanitized =
      reply.replace(/^\s*ESCALATE\s*:.*$/im, "").trim() || reply.trim();
    return json(200, {
      draft: sanitized,
      would_escalate: /^\s*ESCALATE\s*:/i.test(reply),
    });
  } catch (err) {
    console.error("[hilux-draft-reply] uncaught:", err);
    return json(500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
