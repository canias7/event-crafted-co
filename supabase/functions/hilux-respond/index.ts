// HILUX v1.8 — vendor-side auto-reply, profile-scoped config.
//
// Trigger fires on host-message insert. We sleep 2s for debounce,
// then re-check that the message is still the latest. If still
// latest, we set the typing indicator, pull listing + owner-profile
// context, call Claude, score the lead, and either insert a reply
// or escalate (a notification per vendor team member). Either way
// we clear the typing indicator at the end.
//
// HILUX config (enabled, instructions, voice, action toggles) lives
// on the OWNER profile, not the listing — see _shared/hilux-prompt.ts
// loadVendorContext().

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  buildSystemPrompt,
  callClaude,
  DEFAULT_ACTIONS,
  detectBookingIntent,
  extractInquiryFields,
  isInQuietHours,
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
    if (!ctx.profile || !ctx.profile.hilux_enabled) return ok({ skipped: "hilux_off" });
    if (!ctx.vendor.user_id) return ok({ skipped: "no_owner" });

    // Pacing-level skips. Each one short-circuits BEFORE we touch
    // typing indicators or Claude, so a paused thread never shows
    // "HILUX is typing..." and we never spend API tokens.

    // Quiet hours: vendor asked us to stay silent overnight.
    if (ctx.profile.actions.quietHours && isInQuietHours()) {
      return ok({ skipped: "quiet_hours" });
    }

    // Pause on weekends (UTC days). Same coarse-TZ caveat as
    // quiet hours — vendor-local Friday late-night might still
    // land in the UTC Saturday window. v1 approximation.
    if (ctx.profile.actions.pauseWeekends) {
      const dow = new Date().getUTCDay(); // 0=Sun, 6=Sat
      if (dow === 0 || dow === 6) {
        return ok({ skipped: "weekend_pause" });
      }
    }

    // Skip if the vendor was active in this thread in the last 30 min.
    // "Active" = posted a non-HILUX-generated message. If the vendor
    // is handling the conversation themselves, HILUX defers.
    if (ctx.profile.actions.skipWhenActive) {
      const cutoffIso = new Date(Date.now() - 30 * 60_000).toISOString();
      const { data: recentVendor } = await admin
        .from("direct_messages")
        .select("id")
        .eq("thread_id", threadId)
        .eq("sender_role", "vendor")
        .eq("is_hilux_generated", false)
        .gte("created_at", cutoffIso)
        .limit(1);
      if ((recentVendor ?? []).length > 0) {
        return ok({ skipped: "vendor_active_in_thread" });
      }
    }

    // Reply cap: when capRepliesPerInquiry is on, HILUX backs off
    // after 6 of its own replies in this thread. The vendor handles
    // the rest. Prevents runaway loops on hosts who keep messaging.
    if (ctx.profile.actions.capRepliesPerInquiry) {
      const { count: hiluxCount } = await admin
        .from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", threadId)
        .eq("is_hilux_generated", true);
      if ((hiluxCount ?? 0) >= 6) {
        return ok({ skipped: "reply_cap_reached", hilux_count: hiluxCount });
      }
    }

    const { data: triggeringMessage, error: msgErr } = await admin
      .from("direct_messages")
      .select("id, sender_role, body, created_at")
      .eq("id", messageId)
      .maybeSingle();
    if (msgErr) throw msgErr;
    if (!triggeringMessage || triggeringMessage.sender_role !== "host") {
      return ok({ skipped: "bad_trigger_msg" });
    }

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

    const actions = ctx.profile?.actions ?? DEFAULT_ACTIONS;

    // First name comes from the host's profiles.display_name. We only
    // bother looking it up when the toggle is on; the prompt will
    // ignore it otherwise.
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

    // First reply iff there's no prior assistant (vendor/HILUX)
    // message in the loaded history. orderedHistory ends with the
    // host's just-arrived message; anything before it that's
    // assistant means HILUX has spoken in this thread before.
    const isFirstReply = !orderedHistory.some(
      (m) => m.sender_role === "vendor",
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
      greetingLine: ctx.profile?.hilux_greeting_line ?? null,
      replyLength: ctx.profile?.hilux_reply_length ?? "medium",
      isFirstReply,
    });

    const claudeMessages = orderedHistory.map((m) => ({
      role: (m.sender_role === "host" ? "user" : "assistant") as "user" | "assistant",
      content: m.body,
    }));
    if (claudeMessages.length === 0 || claudeMessages[claudeMessages.length - 1].role !== "user") {
      await clearTyping();
      return ok({ skipped: "no_trailing_host_msg" });
    }

    log("calling claude", { vendor: ctx.vendor.id, history_len: claudeMessages.length });
    const reply = await callClaude(ANTHROPIC_API_KEY, systemText, claudeMessages);

    // Booking-intent detection: when on, classify the host's LATEST
    // message for explicit commitment ("yes, book us"). Sets
    // inquiries.booking_intent_at so the vendor can filter their
    // inbox to "ready to close" without rereading every thread.
    // Bounded + best-effort; never blocks the reply path.
    const detectIntentAfter = async () => {
      if (!thread.inquiry_id) return;
      if (!actions.detectBookingIntent) return;
      try {
        const result = await detectBookingIntent(ANTHROPIC_API_KEY, {
          businessName: ctx.vendor!.business_name ?? "this vendor",
          transcript: claudeMessages,
        });
        if (!result.detected) return;
        // Only set the timestamp the FIRST time we detect intent
        // for this inquiry — repeat-detect on every host message
        // in a hot conversation would clobber the original moment.
        const { data: priorRow } = await admin
          .from("inquiries")
          .select("booking_intent_at")
          .eq("id", thread.inquiry_id)
          .maybeSingle();
        if ((priorRow as { booking_intent_at?: string } | null)?.booking_intent_at) return;
        const { error: intentErr } = await admin
          .from("inquiries")
          .update({
            booking_intent_at: new Date().toISOString(),
            booking_intent_reason: result.reason,
          })
          .eq("id", thread.inquiry_id);
        if (intentErr) console.error("[hilux-respond] booking_intent update failed", intentErr);
        else log("booking intent flagged", { inquiry: thread.inquiry_id, reason: result.reason });
      } catch (err) {
        console.error("[hilux-respond] booking_intent error", err);
      }
    };

    // Inquiry-field extraction: when on, pull event_date / guest_count
    // / budget / etc. that the host stated in chat and write back to
    // the inquiry. Only fill NULL columns so vendor-confirmed values
    // are never overwritten by a chat-extracted guess.
    const extractFieldsAfter = async () => {
      if (!thread.inquiry_id) return;
      if (!actions.updateInquiryFields) return;
      try {
        const extracted = await extractInquiryFields(ANTHROPIC_API_KEY, {
          transcript: claudeMessages,
          todayIso: new Date().toISOString().slice(0, 10),
        });
        const keys = Object.keys(extracted) as Array<keyof typeof extracted>;
        if (keys.length === 0) return;
        // Read current values so we only fill nulls.
        const { data: current } = await admin
          .from("inquiries")
          .select("event_type, event_date, guest_count, location, budget_min_cents, budget_max_cents, special_requests")
          .eq("id", thread.inquiry_id)
          .maybeSingle();
        if (!current) return;
        const patch: Record<string, unknown> = {};
        for (const k of keys) {
          if ((current as any)[k] == null && extracted[k] != null) {
            patch[k] = extracted[k];
          }
        }
        if (Object.keys(patch).length === 0) return;
        const { error: upErr } = await admin
          .from("inquiries")
          .update(patch)
          .eq("id", thread.inquiry_id);
        if (upErr) console.error("[hilux-respond] inquiry field update failed", upErr);
        else log("inquiry fields extracted", { inquiry: thread.inquiry_id, filled: Object.keys(patch) });
      } catch (err) {
        console.error("[hilux-respond] extract fields error", err);
      }
    };

    const scoreInquiryAfter = async () => {
      if (!thread.inquiry_id) return;
      try {
        // Read the prior score BEFORE we overwrite it, so we can
        // detect the "warm → hot" transition that fires the hot-lead
        // notification.
        const { data: priorRow } = await admin
          .from("inquiries")
          .select("lead_score")
          .eq("id", thread.inquiry_id)
          .maybeSingle();
        const priorScore = (priorRow as { lead_score?: string } | null)?.lead_score ?? null;

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

        // Hot-lead notification: only fire when the lead JUST became
        // hot (was not hot before). Skips repeat-hot pings on every
        // host message in a hot conversation.
        if (
          actions.notifyOnHotLead &&
          result.score === "hot" &&
          priorScore !== "hot"
        ) {
          const { data: members } = await admin
            .from("vendor_team_members")
            .select("user_id")
            .eq("vendor_id", ctx.vendor!.id);
          const rows = ((members ?? []) as Array<{ user_id: string }>).map((m) => ({
            user_id: m.user_id,
            type: "hilux_hot_lead",
            title: "Hot lead — HILUX flagged this one",
            body: result.reason || "Host is ready to book.",
            link: `/vendor/messages?thread=${threadId}`,
          }));
          if (rows.length > 0) {
            const { error: nerr } = await admin.from("notifications").insert(rows);
            if (nerr) console.error("[hilux-respond] hot-lead notify failed", nerr);
          }
        }
      } catch (err) {
        console.error("[hilux-respond] lead_score error", err);
      }
    };

    // Escalate is only meaningful when the vendor has it ON. If
    // escalate is OFF the system prompt already instructs Claude to
    // always reply; if it slips and outputs ESCALATE anyway, we just
    // post a generic placeholder rather than dropping the reply.
    const escalateMatch = actions.escalate
      ? reply.match(/^\s*ESCALATE\s*:\s*(.+)$/im)
      : null;
    if (escalateMatch) {
      const reason = escalateMatch[1].trim().slice(0, 200);
      const preview = (triggeringMessage.body ?? "").slice(0, 120);
      const title = "HILUX needs you to take this one";
      const body = `${preview}${triggeringMessage.body.length > 120 ? "…" : ""} — reason: ${reason}`;
      let notified = 0;
      if (actions.notifyOnEscalation) {
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
        notified = rows.length;
      }
      log("hilux escalated", { thread: threadId, reason, notified });
      await scoreInquiryAfter();
      await detectIntentAfter();
      await extractFieldsAfter();
      await clearTyping();
      return ok({ escalated: true, reason, notified });
    }

    // If escalate is OFF and Claude still tried to escalate, strip
    // the ESCALATE: line so the host doesn't see the raw token.
    const sanitized = reply.replace(/^\s*ESCALATE\s*:.*$/im, "").trim() || reply.trim();

    const { error: insertErr } = await admin.from("direct_messages").insert({
      thread_id: threadId,
      sender_id: ctx.vendor.user_id,
      sender_role: "vendor",
      body: sanitized,
      is_hilux_generated: true,
    });
    if (insertErr) {
      await clearTyping();
      throw insertErr;
    }

    log("hilux replied", { thread: threadId, length: sanitized.length });

    // Auto-mark the inquiry as 'replied' so it moves out of the
    // vendor's 'new' bucket. Only flips when the inquiry is still
    // in 'new' — we don't downgrade won/lost/etc.
    if (actions.autoMarkReplied && thread.inquiry_id) {
      const { error: statusErr } = await admin
        .from("inquiries")
        .update({ status: "replied" })
        .eq("id", thread.inquiry_id)
        .eq("status", "new");
      if (statusErr) console.error("[hilux-respond] auto-mark replied failed", statusErr);
    }

    // Notify the vendor team that HILUX just replied on their
    // behalf. Default OFF — most vendors don't want a push every
    // time. Notification type 'hilux_reply' so the bell can group
    // these separately from real direct-message pings.
    if (actions.notifyOnReply) {
      const { data: members } = await admin
        .from("vendor_team_members")
        .select("user_id")
        .eq("vendor_id", ctx.vendor.id);
      const rows = ((members ?? []) as Array<{ user_id: string }>).map((m) => ({
        user_id: m.user_id,
        type: "hilux_reply",
        title: "HILUX replied for you",
        body: sanitized.slice(0, 140),
        link: `/vendor/messages?thread=${threadId}`,
      }));
      if (rows.length > 0) {
        const { error: notifErr } = await admin.from("notifications").insert(rows);
        if (notifErr) console.error("[hilux-respond] notify failed", notifErr);
      }
    }

    await scoreInquiryAfter();
    await detectIntentAfter();
    await extractFieldsAfter();
    await clearTyping();
    return ok({ replied: true, length: sanitized.length });
  } catch (err) {
    console.error("[hilux-respond] uncaught:", err);
    await clearTyping();
    return ok({ error: err instanceof Error ? err.message : String(err) });
  }
});
