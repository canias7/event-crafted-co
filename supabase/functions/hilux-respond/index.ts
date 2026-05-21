// HILUX v1.7 — vendor-side auto-reply with debounce + typing indicator.
//
// Flow:
//   1. Trigger fires on host-message insert and POSTs here.
//   2. We sleep 2s. During that window, additional rapid host
//      messages will also fire the trigger and spawn their own
//      invocations. After the sleep we re-check: if a newer message
//      now exists, we bail BEFORE calling Claude — saving the API
//      tokens. Net effect: a burst of 5 host messages = 1 Claude
//      call (the latest), not 5.
//   3. Set direct_threads.hilux_typing_until = now()+30s so the host
//      UI shows "HILUX is typing..." via its realtime subscription.
//   4. Call Claude, then score lead, then either insert reply OR
//      escalate. Either way, clear hilux_typing_until at the end.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  buildSystemPrompt,
  callClaude,
  loadVendorContext,
  priceUsd,
  scoreLead,
} from "../_shared/hilux-prompt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const HISTORY_LIMIT = 20;
const DEBOUNCE_MS = 2000;
const TYPING_TTL_MS = 30000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: true, ...extra }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function log(...args: unknown[]) {
  console.log("[hilux-respond]", ...args);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let typingThreadId: string | null = null;
  const clearTyping = async () => {
    if (typingThreadId) {
      await admin
        .from("direct_threads")
        .update({ hilux_typing_until: null })
        .eq("id", typingThreadId);
    }
  };

  try {
    const payload = await req.json().catch(() => ({}));
    const threadId = String(payload?.thread_id ?? "").trim();
    const messageId = String(payload?.message_id ?? "").trim();
    if (!threadId || !messageId) return ok({ skipped: "bad_payload" });

    const { data: thread, error: threadErr } = await admin
      .from("direct_threads")
      .select("id, vendor_id, inquiry_id, host_id, hilux_paused")
      .eq("id", threadId)
      .maybeSingle();
    if (threadErr) throw threadErr;
    if (!thread) return ok({ skipped: "no_thread" });
    if (thread.hilux_paused) return ok({ skipped: "thread_paused" });

    const ctx = await loadVendorContext(admin, thread.vendor_id);
    if (!ctx.vendor) return ok({ skipped: "no_vendor" });
    if (!ctx.vendor.hilux_enabled) return ok({ skipped: "hilux_off" });
    if (!ctx.vendor.user_id) return ok({ skipped: "no_owner" });

    const { data: triggeringMessage, error: msgErr } = await admin
      .from("direct_messages")
      .select("id, sender_role, body, created_at")
      .eq("id", messageId)
      .maybeSingle();
    if (msgErr) throw msgErr;
    if (!triggeringMessage || triggeringMessage.sender_role !== "host") {
      return ok({ skipped: "bad_trigger_msg" });
    }

    // DEBOUNCE: wait briefly so bursts of host messages collapse to
    // a single Claude call. If a newer message arrived during the
    // wait, this invocation exits without spending API tokens.
    await sleep(DEBOUNCE_MS);

    const { data: latest } = await admin
      .from("direct_messages")
      .select("id")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (latest && latest.length > 0 && latest[0].id !== messageId) {
      return ok({ skipped: "stale_after_debounce" });
    }

    // TYPING INDICATOR: set a TTL so a crash doesn't leave the host
    // staring at a permanent typing dot. Cleared at the end.
    typingThreadId = threadId;
    await admin
      .from("direct_threads")
      .update({
        hilux_typing_until: new Date(Date.now() + TYPING_TTL_MS).toISOString(),
      })
      .eq("id", threadId);

    const { data: history } = await admin
      .from("direct_messages")
      .select("sender_role, body, created_at")
      .eq("thread_id", threadId)
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
      await clearTyping();
      return ok({ skipped: "no_trailing_host_msg" });
    }

    log("calling claude", { vendor: ctx.vendor.id, history_len: claudeMessages.length });
    const reply = await callClaude(ANTHROPIC_API_KEY, systemText, claudeMessages);

    const scoreInquiryAfter = async () => {
      if (!thread.inquiry_id) return;
      try {
        const result = await scoreLead(ANTHROPIC_API_KEY, {
          businessName: ctx.vendor!.business_name ?? "this vendor",
          category: ctx.vendor!.category,
          inquiry: inquiryCtx,
          transcript: claudeMessages,
        });
        const { error: scoreErr } = await admin
          .from("inquiries")
          .update({
            lead_score: result.score,
            lead_score_reason: result.reason,
            lead_score_updated_at: new Date().toISOString(),
          })
          .eq("id", thread.inquiry_id);
        if (scoreErr) console.error("[hilux-respond] lead_score update failed", scoreErr);
      } catch (err) {
        console.error("[hilux-respond] lead_score error", err);
      }
    };

    const escalateMatch = reply.match(/^\s*ESCALATE\s*:\s*(.+)$/im);
    if (escalateMatch) {
      const reason = escalateMatch[1].trim().slice(0, 200);
      const preview = (triggeringMessage.body ?? "").slice(0, 120);
      const title = "HILUX needs you to take this one";
      const body = `${preview}${triggeringMessage.body.length > 120 ? "…" : ""} — reason: ${reason}`;
      const { data: members } = await admin
        .from("vendor_team_members")
        .select("user_id")
        .eq("vendor_id", ctx.vendor.id);
      const rows = ((members ?? []) as Array<{ user_id: string }>).map((m) => ({
        user_id: m.user_id,
        type: "hilux_escalation",
        title,
        body,
        link: `/vendor/messages?thread=${threadId}`,
      }));
      if (rows.length > 0) {
        const { error: notifErr } = await admin.from("notifications").insert(rows);
        if (notifErr) console.error("[hilux-respond] notification insert failed", notifErr);
      }
      log("hilux escalated", { thread: threadId, reason, notified: rows.length });
      await scoreInquiryAfter();
      await clearTyping();
      return ok({ escalated: true, reason, notified: rows.length });
    }

    const { error: insertErr } = await admin.from("direct_messages").insert({
      thread_id: threadId,
      sender_id: ctx.vendor.user_id,
      sender_role: "vendor",
      body: reply,
      is_hilux_generated: true,
    });
    if (insertErr) {
      await clearTyping();
      throw insertErr;
    }

    log("hilux replied", { thread: threadId, length: reply.length });
    await scoreInquiryAfter();
    await clearTyping();
    return ok({ replied: true, length: reply.length });
  } catch (err) {
    console.error("[hilux-respond] uncaught:", err);
    await clearTyping();
    return ok({ error: err instanceof Error ? err.message : String(err) });
  }
});
