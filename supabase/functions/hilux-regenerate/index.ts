// HILUX regenerate. Vendor doesn't love a HILUX reply, taps
// "Regenerate" in the inbox, gets a fresh draft in the SAME row.
// Only works on the latest HILUX-generated message in a thread.

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
import {
  consumeCredits,
  refundCredits,
  insufficientCreditsResponse,
} from "../_shared/credits.ts";

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
    const messageId = String(payload?.message_id ?? "").trim();
    if (!messageId) return json(400, { error: "missing_message_id" });

    const { data: target } = await userClient
      .from("direct_messages")
      .select("id, thread_id, body, sender_role, is_hilux_generated, created_at")
      .eq("id", messageId)
      .maybeSingle();
    if (!target) return json(404, { error: "message_not_found" });
    if (target.sender_role !== "vendor") return json(400, { error: "not_a_vendor_message" });
    if (!target.is_hilux_generated) return json(400, { error: "not_a_hilux_message" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: thread } = await admin
      .from("direct_threads")
      .select("id, vendor_id, inquiry_id, host_id")
      .eq("id", target.thread_id)
      .maybeSingle();
    if (!thread) return json(404, { error: "thread_not_found" });

    // Vendor-ownership check. Without this, a host (who can SELECT
    // any direct_messages row in their thread) could call this
    // endpoint with a HILUX message_id and rewrite the body.
    const { data: membership } = await admin
      .from("vendor_team_members")
      .select("user_id")
      .eq("vendor_id", thread.vendor_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!membership) return json(403, { error: "not_a_vendor_member" });

    const { data: latest } = await admin
      .from("direct_messages")
      .select("id")
      .eq("thread_id", target.thread_id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (!latest || latest[0].id !== messageId) return json(409, { error: "not_the_latest_message" });

    const ctx = await loadVendorContext(admin, thread.vendor_id);
    if (!ctx.vendor) return json(404, { error: "vendor_not_found" });

    const { data: history } = await admin
      .from("direct_messages")
      .select("sender_role, body, created_at, is_hilux_generated")
      .eq("thread_id", target.thread_id)
      .lt("created_at", target.created_at)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    const orderedHistory = (history ?? []).slice().reverse();

    let inquiryCtx: any = null;
    if (thread.inquiry_id) {
      const { data: inq } = await admin
        .from("inquiries")
        .select("event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests")
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

    const actions = ctx.profile?.actions ?? DEFAULT_ACTIONS;

    let hostFirstName: string | null = null;
    if (actions.useFirstName && thread.host_id) {
      const { data: hostProfile } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", thread.host_id)
        .maybeSingle();
      const raw = (hostProfile as { display_name?: string } | null)?.display_name?.trim() ?? "";
      hostFirstName = raw.length > 0 ? raw.split(/\s+/)[0] : null;
    }

    // For regenerate, treat it as a first reply only when no
    // earlier HILUX message exists. Keys off is_hilux_generated
    // so a manual vendor reply earlier in the thread doesn't
    // suppress the greeting line on HILUX's first regenerated take.
    const isFirstReply = !orderedHistory.some(
      (m) => (m as { is_hilux_generated?: boolean }).is_hilux_generated === true,
    );
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
      isFirstReply,
    });

    const claudeMessages = orderedHistory.map((m) => ({
      role: (m.sender_role === "host" ? "user" : "assistant") as "user" | "assistant",
      content: m.body,
    }));
    if (claudeMessages.length === 0 || claudeMessages[claudeMessages.length - 1].role !== "user") {
      return json(400, { error: "no_host_message_to_reply_to" });
    }

    const seasoned = systemText +
      "\n\nIMPORTANT: The vendor has just asked you to RE-DRAFT a reply because they didn't love the previous version. Take a noticeably different angle — different opener, different emphasis — while still answering the host's most recent message. Don't apologize or reference the previous draft.";

    // Charge credits BEFORE the Claude call. Refunded below if the
    // call throws, returns ESCALATE, or the message update fails —
    // vendor shouldn't pay for an outcome they can't use.
    const consume = await consumeCredits(
      userData.user.id,
      "hilux_regenerate",
      messageId,
    );
    if (!consume.ok) {
      if (consume.reason === "insufficient_credits") {
        return insufficientCreditsResponse(consume.cost, cors);
      }
      return json(503, { error: "credit_service_unavailable" });
    }

    let reply: string;
    try {
      reply = await callClaude(ANTHROPIC_API_KEY, seasoned, claudeMessages, {
        userId: userData.user.id,
        actionType: "hilux_regenerate",
        refId: messageId,
      });
    } catch (claudeErr) {
      await refundCredits(
        userData.user.id,
        "hilux_regenerate",
        messageId,
        `claude_error: ${claudeErr instanceof Error ? claudeErr.message : String(claudeErr)}`,
      );
      throw claudeErr;
    }
    if (/^\s*ESCALATE\s*:/i.test(reply)) {
      await refundCredits(
        userData.user.id,
        "hilux_regenerate",
        messageId,
        "would_escalate",
      );
      return json(409, { error: "would_escalate", body: reply.trim() });
    }

    const { error: updateErr } = await admin
      .from("direct_messages")
      .update({ body: reply, edited_at: new Date().toISOString() })
      .eq("id", messageId);
    if (updateErr) {
      await refundCredits(
        userData.user.id,
        "hilux_regenerate",
        messageId,
        `update_failed: ${updateErr.message ?? String(updateErr)}`,
      );
      console.error("[hilux-regenerate] update failed", updateErr);
      return json(500, { error: "update_failed" });
    }

    console.log("[hilux-regenerate] ok", { user: userData.user.id, message_id: messageId, length: reply.length });
    return json(200, { reply, credits_remaining: consume.balance });
  } catch (err) {
    console.error("[hilux-regenerate] uncaught:", err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
