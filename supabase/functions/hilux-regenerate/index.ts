// HILUX regenerate. Vendor doesn't love a HILUX reply, taps
// "Regenerate" in the inbox, and gets a fresh draft in the SAME
// message row. Only works on the latest HILUX-generated message in
// a thread — once the host has replied, there's no point.
//
// verify_jwt = true; the vendor's session JWT authenticates the
// caller, and RLS gates which threads/messages they can touch.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  buildSystemPrompt,
  callClaude,
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

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
    const messageId = String(payload?.message_id ?? "").trim();
    if (!messageId) return json(400, { error: "missing_message_id" });

    // Ownership-gated read of the target message. RLS lets the vendor
    // team members read messages on threads they own.
    const { data: target } = await userClient
      .from("direct_messages")
      .select(
        "id, thread_id, body, sender_role, is_hilux_generated, created_at",
      )
      .eq("id", messageId)
      .maybeSingle();
    if (!target) return json(404, { error: "message_not_found" });
    if (target.sender_role !== "vendor") {
      return json(400, { error: "not_a_vendor_message" });
    }
    if (!target.is_hilux_generated) {
      return json(400, { error: "not_a_hilux_message" });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: thread } = await admin
      .from("direct_threads")
      .select("id, vendor_id, inquiry_id, host_id")
      .eq("id", target.thread_id)
      .maybeSingle();
    if (!thread) return json(404, { error: "thread_not_found" });

    // Stop if the HILUX message isn't the latest — once the host has
    // moved on, regenerating muddies the conversation.
    const { data: latest } = await admin
      .from("direct_messages")
      .select("id")
      .eq("thread_id", target.thread_id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (!latest || latest[0].id !== messageId) {
      return json(409, { error: "not_the_latest_message" });
    }

    const ctx = await loadVendorContext(admin, thread.vendor_id);
    if (!ctx.vendor) return json(404, { error: "vendor_not_found" });

    // History excluding the target message itself — we want Claude to
    // re-derive a reply from the same prior state.
    const { data: history } = await admin
      .from("direct_messages")
      .select("sender_role, body, created_at")
      .eq("thread_id", target.thread_id)
      .lt("created_at", target.created_at)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    const orderedHistory = (history ?? []).slice().reverse();

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

    const systemText = buildSystemPrompt({
      businessName: ctx.vendor.business_name ?? "this vendor",
      category: ctx.vendor.category,
      bio: ctx.vendor.bio,
      location: ctx.vendor.location,
      startingPriceUsd: priceUsd(ctx.vendor.base_price_cents),
      customInstructions: ctx.vendor.hilux_instructions ?? null,
      voiceSamples: ctx.vendor.hilux_voice_samples ?? [],
      packages: ctx.packages,
      faqs: ctx.faqs,
      inquiry: inquiryCtx,
      availability: ctx.availability,
    });

    const claudeMessages = orderedHistory.map((m) => ({
      role: (m.sender_role === "host" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: m.body,
    }));
    if (claudeMessages.length === 0 || claudeMessages[claudeMessages.length - 1].role !== "user") {
      return json(400, { error: "no_host_message_to_reply_to" });
    }

    // Add a small nudge so Claude doesn't return a near-identical
    // reply on regenerate. The previous reply was the rejected one;
    // we want a meaningfully different angle.
    const seasoned = systemText +
      "\n\nIMPORTANT: The vendor has just asked you to RE-DRAFT a reply because they didn't love the previous version. Take a noticeably different angle — different opener, different emphasis — while still answering the host's most recent message. Don't apologize or reference the previous draft.";

    const reply = await callClaude(ANTHROPIC_API_KEY, seasoned, claudeMessages);

    if (/^\s*ESCALATE\s*:/i.test(reply)) {
      return json(409, { error: "would_escalate", body: reply.trim() });
    }

    const { error: updateErr } = await admin
      .from("direct_messages")
      .update({ body: reply, edited_at: new Date().toISOString() })
      .eq("id", messageId);
    if (updateErr) {
      console.error("[hilux-regenerate] update failed", updateErr);
      return json(500, { error: "update_failed" });
    }

    console.log("[hilux-regenerate] ok", {
      user: userData.user.id,
      message_id: messageId,
      length: reply.length,
    });
    return json(200, { reply });
  } catch (err) {
    console.error("[hilux-regenerate] uncaught:", err);
    return json(500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
