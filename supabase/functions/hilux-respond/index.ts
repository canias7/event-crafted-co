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
  callClaudeWithUsage,
  type ClaudeUsage,
  DEFAULT_ACTIONS,
  loadVendorContext,
  priceUsd,
  scoreLead,
} from "../_shared/hilux-prompt.ts";
import {
  consumeCredits,
  refundCredits,
} from "../_shared/credits.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <noreply@eventvendora.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";

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

    // Deep link to the inquiry-detail page. The vendor inbox is
    // routed /vendor/inbox/:inquiryId — keyed by inquiry id, not
    // thread id. Every notification + email below uses this.
    const inquiryPath = thread.inquiry_id
      ? `/vendor/inbox/${thread.inquiry_id}`
      : "/vendor/inbox";

    const ctx = await loadVendorContext(admin, thread.vendor_id);
    if (!ctx.vendor) return ok({ skipped: "no_vendor" });
    if (!ctx.profile || !ctx.profile.hilux_enabled) return ok({ skipped: "hilux_off" });
    if (!ctx.vendor.user_id) return ok({ skipped: "no_owner" });

    // Pacing-level skip. Short-circuits BEFORE we touch typing
    // indicators or Claude, so a deferred thread never shows
    // "HILUX is typing..." and we never spend API tokens.

    // Skip if the vendor was active in this thread in the last 30 min.
    // "Active" = posted a non-HILUX-generated message. If the vendor
    // is handling the conversation themselves, HILUX defers.
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
      .select("sender_role, body, created_at, is_hilux_generated")
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

    // First reply iff HILUX has not spoken in this thread before.
    // We key off is_hilux_generated (not sender_role === "vendor")
    // so a manual vendor reply doesn't suppress HILUX's greeting
    // line when it later picks up the conversation.
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
      await clearTyping();
      return ok({ skipped: "no_trailing_host_msg" });
    }

    // Charge credits BEFORE the Claude call. Refunded if the call
    // throws so a flaky Anthropic response doesn't bill the vendor.
    // Out of credits = HILUX stays silent on this thread; the host
    // just doesn't get an auto-reply. (Vendor sees this in the UI
    // balance widget and the activity log once Phase 4 lands.)
    const consume = await consumeCredits(
      ctx.vendor.user_id,
      "hilux_reply",
      messageId,
    );
    if (!consume.ok) {
      await clearTyping();
      return ok({ skipped: consume.reason });
    }

    log("calling claude", { vendor: ctx.vendor.id, history_len: claudeMessages.length });
    let reply: string;
    let replyUsage: ClaudeUsage;
    try {
      const out = await callClaudeWithUsage(
        ANTHROPIC_API_KEY,
        systemText,
        claudeMessages,
        { userId: ctx.vendor.user_id, actionType: "hilux_reply", refId: messageId },
      );
      reply = out.text;
      replyUsage = out.usage;
    } catch (claudeErr) {
      await refundCredits(
        ctx.vendor.user_id,
        "hilux_reply",
        messageId,
        `claude_error: ${claudeErr instanceof Error ? claudeErr.message : String(claudeErr)}`,
      );
      throw claudeErr;
    }
    // Token accumulator: every Claude call below (scoring, intent,
    // field extraction) adds its usage to this so the per-host-msg
    // cost we log reflects the full HILUX spend, not just the reply.
    const totalUsage: ClaudeUsage = { ...replyUsage };
    const addUsage = (u: ClaudeUsage | undefined) => {
      if (!u) return;
      totalUsage.input_tokens += u.input_tokens;
      totalUsage.output_tokens += u.output_tokens;
      totalUsage.cache_creation_tokens += u.cache_creation_tokens;
      totalUsage.cache_read_tokens += u.cache_read_tokens;
    };

    // Audit log: write one row per HILUX action (reply / escalate).
    // Used by the vendor's activity view + the MCP connector's
    // get_action_log tool. Best-effort. The usage argument carries
    // Anthropic token counts for cost view.
    const logAction = async (
      action: "reply" | "escalate" | "lead_score_hot",
      detail: string | null,
      messageId: string | null,
      usage: ClaudeUsage | null = null,
    ) => {
      const { error } = await admin.from("hilux_action_log").insert({
        user_id: ctx.vendor!.user_id,
        vendor_id: ctx.vendor!.id,
        thread_id: threadId,
        inquiry_id: thread.inquiry_id,
        message_id: messageId,
        action,
        detail,
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
        cache_creation_tokens: usage?.cache_creation_tokens ?? null,
        cache_read_tokens: usage?.cache_read_tokens ?? null,
      });
      if (error) console.error("[hilux-respond] action log insert failed", error);
    };

    const scoreInquiryAfter = async () => {
      if (!thread.inquiry_id) return;
      try {
        // Read the prior score BEFORE we overwrite it, so we can
        // detect the "warm → hot" transition that fires the hot-lead
        // notification. Lead scores live on inquiry_scores now
        // (vendor-only RLS) so hosts can't see how we classified them.
        const { data: priorRow } = await admin
          .from("inquiry_scores")
          .select("lead_score")
          .eq("inquiry_id", thread.inquiry_id)
          .maybeSingle();
        const priorScore = (priorRow as { lead_score?: string } | null)?.lead_score ?? null;

        const result = await scoreLead(
          ANTHROPIC_API_KEY,
          {
            businessName: ctx.vendor!.business_name ?? "this vendor",
            category: ctx.vendor!.category,
            inquiry: inquiryCtx,
            transcript: claudeMessages,
          },
          { userId: ctx.vendor!.user_id, actionType: "hilux_reply", refId: thread.inquiry_id ?? null },
        );
        addUsage(result.usage);
        const { error: scoreErr } = await admin
          .from("inquiry_scores")
          .upsert(
            {
              inquiry_id: thread.inquiry_id,
              lead_score: result.score,
              lead_score_reason: result.reason,
              lead_score_updated_at: new Date().toISOString(),
            },
            { onConflict: "inquiry_id" },
          );
        if (scoreErr) console.error("[hilux-respond] lead_score update failed", scoreErr);

        // Lead just turned hot (was not hot before). Log it for the
        // daily summary + activity feed regardless of the notify
        // toggle; the push/email alert below is opt-in and only
        // fires on the first transition (skips repeat-hot pings on
        // subsequent host messages in a hot conversation).
        if (result.score === "hot" && priorScore !== "hot") {
          await logAction("lead_score_hot", result.reason, null);
          if (actions.notifyOnHotLead) {
            const { data: members } = await admin
              .from("vendor_team_members")
              .select("user_id")
              .eq("vendor_id", ctx.vendor!.id);
            const rows = ((members ?? []) as Array<{ user_id: string }>).map((m) => ({
              user_id: m.user_id,
              type: "hilux_hot_lead",
              title: "Hot lead — HILUX flagged this one",
              body: result.reason || "Host is ready to book.",
              link: inquiryPath,
            }));
            if (rows.length > 0) {
              const { error: nerr } = await admin.from("notifications").insert(rows);
              if (nerr) console.error("[hilux-respond] hot-lead notify failed", nerr);
            }
          }
        }
      } catch (err) {
        console.error("[hilux-respond] lead_score error", err);
      }
    };

    // The only silent step-aside left is the frustrated-host
    // handoff. HILUX outputs ESCALATE: only when detectFrustration
    // is on; for everything else it always replies (offering to
    // loop in the team when it can't answer). If detectFrustration
    // is off and ESCALATE slips out anyway, we ignore the token and
    // strip it from the reply below.
    const escalateMatch = actions.detectFrustration
      ? reply.match(/^\s*ESCALATE\s*:\s*(.+)$/im)
      : null;
    if (escalateMatch) {
      const reason = escalateMatch[1].trim().slice(0, 200);
      const preview = (triggeringMessage.body ?? "").slice(0, 120);
      const title = "Upset host — HILUX handed this to you";
      const body = `${preview}${triggeringMessage.body.length > 120 ? "…" : ""} — reason: ${reason}`;
      let notified = 0;
      const { data: members } = await admin
        .from("vendor_team_members")
        .select("user_id")
        .eq("vendor_id", ctx.vendor.id);
      const memberRows = (members ?? []) as Array<{ user_id: string }>;
      const rows = memberRows.map((m) => ({
        user_id: m.user_id,
        type: "hilux_escalation",
        title,
        body,
        link: inquiryPath,
      }));
      if (rows.length > 0) {
        const { error: notifErr } = await admin.from("notifications").insert(rows);
        if (notifErr) console.error("[hilux-respond] notification insert failed", notifErr);
      }
      notified = rows.length;

      // Action-required email. An escalation is the most
      // time-sensitive HILUX event — a host is waiting and the
      // agent stepped aside — so we email the vendor team
      // immediately, not just the in-app bell. Best-effort.
      if (RESEND_API_KEY) {
        try {
          const vendorName = ctx.vendor.business_name ?? "your business";
          const threadLink = `${APP_URL}${inquiryPath}`;
          for (const m of memberRows) {
            const { data: u } = await admin.auth.admin.getUserById(m.user_id);
            const to = u?.user?.email;
            if (!to) continue;
            const send = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: EMAIL_FROM_ADDRESS,
                to,
                subject: `Action needed — HILUX handed you a conversation`,
                html: escalationEmailHtml({
                  vendorName,
                  hostFirstName,
                  hostBody: triggeringMessage.body ?? "",
                  reason,
                  threadLink,
                }),
              }),
            });
            if (!send.ok) {
              console.error(
                "[hilux-respond] escalation email failed",
                await send.text(),
              );
            }
          }
        } catch (err) {
          console.error("[hilux-respond] escalation email error", err);
        }
      }
      log("hilux escalated", { thread: threadId, reason, notified });
      await logAction("escalate", reason, null, replyUsage);
      await scoreInquiryAfter();
      await clearTyping();
      return ok({ escalated: true, reason, notified });
    }

    // If escalate is OFF and Claude still tried to escalate, strip
    // the ESCALATE: line so the host doesn't see the raw token.
    const sanitized = reply.replace(/^\s*ESCALATE\s*:.*$/im, "").trim() || reply.trim();

    const { data: insertedRow, error: insertErr } = await admin
      .from("direct_messages")
      .insert({
        thread_id: threadId,
        sender_id: ctx.vendor.user_id,
        sender_role: "vendor",
        body: sanitized,
        is_hilux_generated: true,
      })
      .select("id")
      .single();
    if (insertErr) {
      // Audit #1: refund the 2 credits we already debited. Without
      // this, a transient DB write failure billed the vendor for a
      // reply the host never saw.
      await refundCredits(
        ctx.vendor.user_id,
        "hilux_reply",
        messageId,
        `insert_failed: ${insertErr.message ?? String(insertErr)}`,
      );
      await clearTyping();
      throw insertErr;
    }
    const insertedMsgId = (insertedRow as { id: string } | null)?.id ?? null;

    log("hilux replied", { thread: threadId, length: sanitized.length });

    // Auto-mark the inquiry as 'replied' so it moves out of the
    // vendor's 'new' bucket. Only flips when the inquiry is still
    // in 'new' — we don't downgrade won/lost/etc.
    if (thread.inquiry_id) {
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
        link: inquiryPath,
      }));
      if (rows.length > 0) {
        const { error: notifErr } = await admin.from("notifications").insert(rows);
        if (notifErr) console.error("[hilux-respond] notify failed", notifErr);
      }
    }

    await scoreInquiryAfter();
    // Log AFTER the helpers so totalUsage reflects every Claude call
    // the host's message triggered — reply + score.
    await logAction("reply", null, insertedMsgId, totalUsage);
    await clearTyping();
    return ok({ replied: true, length: sanitized.length });
  } catch (err) {
    console.error("[hilux-respond] uncaught:", err);
    await clearTyping();
    return ok({ error: err instanceof Error ? err.message : String(err) });
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escalationEmailHtml(args: {
  vendorName: string;
  hostFirstName: string | null;
  hostBody: string;
  reason: string;
  threadLink: string;
}): string {
  const hostLabel = args.hostFirstName ? escapeHtml(args.hostFirstName) : "A host";
  const hostBody = escapeHtml(args.hostBody).replace(/\n/g, "<br />");
  const reason = escapeHtml(args.reason);
  // CTA button sits near the TOP — right under the intro — so Gmail's
  // "trim repeated content" heuristic (the •••) can never collapse it
  // out of view. The quote + reason blocks live below it.
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <div style="display:inline-block;background:#fef2f2;color:#b91c1c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;padding:5px 10px;border-radius:999px;margin-bottom:14px;">Action needed</div>
  <p style="font-size:15px;margin:0 0 18px;"><strong>${hostLabel}</strong> sounds upset, so HILUX stepped aside on a conversation for <strong>${escapeHtml(args.vendorName)}</strong> — <strong>they need a personal reply from you.</strong></p>
  <p style="margin:0 0 24px;"><a href="${escapeHtml(args.threadLink)}" style="background:#b91c1c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;font-weight:600;font-size:15px;">Reply to the host →</a></p>
  <div style="border-left:3px solid #ddd;padding:8px 16px;margin:0 0 16px;color:#555;">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${hostLabel} wrote</div>
    <div>${hostBody}</div>
  </div>
  <div style="border-left:3px solid #b91c1c;padding:8px 16px;margin:0 0 20px;">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;color:#b91c1c;">Why HILUX escalated</div>
    <div>${reason}</div>
  </div>
  <p style="margin:0;"><a href="${escapeHtml(args.threadLink)}" style="color:#b91c1c;font-weight:600;text-decoration:none;">Open the conversation →</a></p>
  <p style="color:#999;font-size:11px;margin-top:24px;">HILUX did not send a reply — the conversation is waiting on you. You're getting this because the "Notify me when HILUX escalates" toggle is on.</p>
</body></html>`;
}
