// HILUX v1.2 — vendor-side auto-reply agent.
//
// Triggered by an AFTER INSERT trigger on direct_messages (sender_role
// = 'host') when the destination vendor has hilux_enabled = true. The
// trigger POSTs { thread_id, message_id }; this function pulls the
// vendor's listing context (incl. live availability + custom
// instructions) + recent conversation history, asks Claude to draft a
// reply in the vendor's voice and the host's language, and writes it
// back into direct_messages as sender_role = 'vendor' with
// is_hilux_generated = true.
//
// Prompt logic lives in _shared/hilux-prompt.ts so the sandbox
// (hilux-sandbox) uses the exact same wiring and can't drift.

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
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const HISTORY_LIMIT = 20;

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const payload = await req.json().catch(() => ({}));
    const threadId = String(payload?.thread_id ?? "").trim();
    const messageId = String(payload?.message_id ?? "").trim();
    if (!threadId || !messageId) {
      log("missing thread_id or message_id; ignoring");
      return ok({ skipped: "bad_payload" });
    }

    const { data: thread, error: threadErr } = await admin
      .from("direct_threads")
      .select("id, vendor_id, inquiry_id, host_id")
      .eq("id", threadId)
      .maybeSingle();
    if (threadErr) throw threadErr;
    if (!thread) {
      log("thread not found", threadId);
      return ok({ skipped: "no_thread" });
    }

    const ctx = await loadVendorContext(admin, thread.vendor_id);
    if (!ctx.vendor) {
      log("vendor not found", thread.vendor_id);
      return ok({ skipped: "no_vendor" });
    }
    if (!ctx.vendor.hilux_enabled) {
      log("hilux disabled at processing time, skipping", ctx.vendor.id);
      return ok({ skipped: "hilux_off" });
    }
    if (!ctx.vendor.user_id) {
      log("vendor has no user_id, can't send as them", ctx.vendor.id);
      return ok({ skipped: "no_owner" });
    }

    const { data: triggeringMessage, error: msgErr } = await admin
      .from("direct_messages")
      .select("id, sender_role, body, created_at")
      .eq("id", messageId)
      .maybeSingle();
    if (msgErr) throw msgErr;
    if (!triggeringMessage || triggeringMessage.sender_role !== "host") {
      log("triggering message missing or not from host", messageId);
      return ok({ skipped: "bad_trigger_msg" });
    }

    const { data: latest, error: latestErr } = await admin
      .from("direct_messages")
      .select("id, sender_role, body, created_at, is_hilux_generated")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (latestErr) throw latestErr;
    if (latest && latest.length > 0 && latest[0].id !== messageId) {
      log("a newer message exists since the trigger fired, skipping this run");
      return ok({ skipped: "stale" });
    }

    const { data: history, error: histErr } = await admin
      .from("direct_messages")
      .select("sender_role, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (histErr) throw histErr;
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
      packages: ctx.packages,
      faqs: ctx.faqs,
      inquiry: inquiryCtx,
      availability: ctx.availability,
    });

    const claudeMessages = orderedHistory.map((m) => ({
      role: (m.sender_role === "host" ? "user" : "assistant") as "user" | "assistant",
      content: m.body,
    }));
    if (claudeMessages.length === 0 || claudeMessages[claudeMessages.length - 1].role !== "user") {
      log("no host message at end of history, skipping");
      return ok({ skipped: "no_trailing_host_msg" });
    }

    log("calling claude", { vendor: ctx.vendor.id, history_len: claudeMessages.length });
    const reply = await callClaude(ANTHROPIC_API_KEY, systemText, claudeMessages);

    // Smart escalation: if Claude couldn't confidently answer, it
    // outputs "ESCALATE: <reason>" instead of a reply. We skip the
    // message insert and instead notify the vendor's team that a
    // host is waiting on a human.
    const escalateMatch = reply.match(/^\s*ESCALATE\s*:\s*(.+)$/im);
    if (escalateMatch) {
      const reason = escalateMatch[1].trim().slice(0, 200);
      const businessName = ctx.vendor.business_name ?? "a host";
      const preview = (triggeringMessage.body ?? "").slice(0, 120);
      const title = `HILUX needs you to take this one`;
      const body = `${preview}${triggeringMessage.body.length > 120 ? "…" : ""} — reason: ${reason}`;
      const { data: members } = await admin
        .from("vendor_team_members")
        .select("user_id")
        .eq("vendor_id", ctx.vendor.id);
      const rows = ((members ?? []) as Array<{ user_id: string }>).map(
        (m) => ({
          user_id: m.user_id,
          type: "hilux_escalation",
          title,
          body,
          link: `/vendor/messages?thread=${threadId}`,
        }),
      );
      if (rows.length > 0) {
        const { error: notifErr } = await admin
          .from("notifications")
          .insert(rows);
        if (notifErr) {
          console.error("[hilux-respond] notification insert failed", notifErr);
        }
      }
      log("hilux escalated", {
        thread: threadId,
        reason,
        notified: rows.length,
      });
      return ok({ escalated: true, reason, notified: rows.length });
    }

    const { error: insertErr } = await admin.from("direct_messages").insert({
      thread_id: threadId,
      sender_id: ctx.vendor.user_id,
      sender_role: "vendor",
      body: reply,
      is_hilux_generated: true,
    });
    if (insertErr) throw insertErr;

    log("hilux replied", { thread: threadId, length: reply.length });
    return ok({ replied: true, length: reply.length });
  } catch (err) {
    console.error("[hilux-respond] uncaught:", err);
    return ok({ error: err instanceof Error ? err.message : String(err) });
  }
});
