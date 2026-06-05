// My Space follow-up scanner. Daily cron. Skips threads where the
// owner profile has hilux_enabled = false. The per-toggle pacing
// switch was retired (migration 20260522070000) — follow-up is now
// permanent agent behavior on every My Space-enabled thread.

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
import { consumeCredits, refundCredits } from "../_shared/credits.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const MIN_AGE_DAYS = 2;
const MAX_AGE_DAYS = 4;
const COOLDOWN_DAYS = 5;
const HISTORY_LIMIT = 20;
const MAX_THREADS_PER_RUN = 50;

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
  console.log("[my-space-follow-up]", ...args);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const now = Date.now();
    const minAgeIso = new Date(now - MIN_AGE_DAYS * 86400000).toISOString();
    const maxAgeIso = new Date(now - MAX_AGE_DAYS * 86400000).toISOString();
    const cooldownIso = new Date(now - COOLDOWN_DAYS * 86400000).toISOString();

    // Candidate threads = My Space-enabled vendor + thread not paused +
    // last activity in our nudge window. The hilux_enabled gate is
    // applied per-thread below via loadVendorContext (joining through
    // profiles in this SELECT would be hairy).
    const { data: candidates, error: candErr } = await admin
      .from("direct_threads")
      .select("id, vendor_id, inquiry_id, last_message_at, hilux_paused")
      .gte("last_message_at", maxAgeIso)
      .lte("last_message_at", minAgeIso)
      .eq("hilux_paused", false)
      .order("last_message_at", { ascending: true })
      .limit(MAX_THREADS_PER_RUN);
    if (candErr) throw candErr;

    let nudged = 0;
    let skipped = 0;
    const skipReasons: Record<string, number> = {};

    for (const thread of (candidates ?? []) as Array<{
      id: string;
      vendor_id: string;
      inquiry_id: string | null;
      last_message_at: string;
    }>) {
      try {
        const ctx = await loadVendorContext(admin, thread.vendor_id);
        if (!ctx.vendor || !ctx.vendor.user_id) {
          skipped++;
          skipReasons.vendor_missing = (skipReasons.vendor_missing ?? 0) + 1;
          continue;
        }
        if (!ctx.profile || !ctx.profile.hilux_enabled) {
          skipped++;
          skipReasons.hilux_off = (skipReasons.hilux_off ?? 0) + 1;
          continue;
        }
        const { data: latest } = await admin
          .from("direct_messages")
          .select("sender_role, is_hilux_generated, body, created_at")
          .eq("thread_id", thread.id)
          .order("created_at", { ascending: false })
          .limit(1);
        const last = (latest ?? [])[0];
        if (!last || last.sender_role !== "vendor") {
          skipped++;
          skipReasons.no_vendor_tail = (skipReasons.no_vendor_tail ?? 0) + 1;
          continue;
        }

        const { data: recentHilux } = await admin
          .from("direct_messages")
          .select("created_at")
          .eq("thread_id", thread.id)
          .eq("is_hilux_generated", true)
          .gte("created_at", cooldownIso)
          .order("created_at", { ascending: false })
          .limit(1);
        if ((recentHilux ?? []).length > 0) {
          const lastHiluxAt = new Date((recentHilux ?? [])[0].created_at).getTime();
          const lastMsgAt = new Date(last.created_at).getTime();
          if (lastHiluxAt >= lastMsgAt - 1000) {
            skipped++;
            skipReasons.cooldown = (skipReasons.cooldown ?? 0) + 1;
            continue;
          }
        }

        const { data: history } = await admin
          .from("direct_messages")
          .select("sender_role, body, created_at")
          .eq("thread_id", thread.id)
          .order("created_at", { ascending: false })
          .limit(HISTORY_LIMIT);
        const ordered = (history ?? []).slice().reverse();

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

        const systemText = buildSystemPrompt({
          businessName: ctx.vendor.business_name ?? "this vendor",
          category: ctx.vendor.category,
          bio: ctx.vendor.bio,
          location: ctx.vendor.location,
          startingPriceUsd: priceUsd(ctx.vendor.base_price_cents),
          customInstructions: ctx.profile.hilux_instructions ?? null,
          voiceSamples: ctx.profile.hilux_voice_samples ?? [],
          packages: ctx.packages,
          faqs: ctx.faqs,
          inquiry: inquiryCtx,
          availability: ctx.availability,
          actions: ctx.profile.actions,
          hostFirstName: null,
          isFirstReply: false,
        });

        const claudeMessages = ordered.map((m) => ({
          role: (m.sender_role === "host" ? "user" : "assistant") as "user" | "assistant",
          content: m.body,
        }));
        claudeMessages.push({
          role: "user",
          content:
            "[SYSTEM] The host has been silent for a few days. Write ONE short, friendly follow-up nudge (1–2 sentences max) in the same language as the previous conversation. Don't repeat what you already said. Don't be pushy. Reference any concrete next step that's natural (a date, a package, an open question they didn't answer). If you can't think of a useful nudge, output \"ESCALATE: silent_no_useful_nudge\" instead.",
        });

        // Charge credits before the Claude call. Cron context: if
        // a specific vendor is out of credits, skip them and move
        // on to the next thread — don't fail the whole cron.
        const consume = await consumeCredits(
          ctx.vendor.user_id,
          "hilux_followup",
          thread.id,
        );
        if (!consume.ok) {
          skipped++;
          skipReasons[`credits_${consume.reason}`] =
            (skipReasons[`credits_${consume.reason}`] ?? 0) + 1;
          continue;
        }

        let reply: string;
        try {
          reply = await callClaude(ANTHROPIC_API_KEY, systemText, claudeMessages, {
            userId: ctx.vendor.user_id,
            actionType: "hilux_followup",
            refId: thread.id,
          });
        } catch (claudeErr) {
          await refundCredits(
            ctx.vendor.user_id,
            "hilux_followup",
            thread.id,
            `claude_error: ${claudeErr instanceof Error ? claudeErr.message : String(claudeErr)}`,
          );
          throw claudeErr;
        }
        if (/^\s*ESCALATE\s*:/i.test(reply)) {
          await refundCredits(
            ctx.vendor.user_id,
            "hilux_followup",
            thread.id,
            "would_escalate",
          );
          skipped++;
          skipReasons.escalated = (skipReasons.escalated ?? 0) + 1;
          continue;
        }

        const { error: insertErr } = await admin
          .from("direct_messages")
          .insert({
            thread_id: thread.id,
            sender_id: ctx.vendor.user_id,
            sender_role: "vendor",
            body: reply,
            is_hilux_generated: true,
          });
        if (insertErr) {
          await refundCredits(
            ctx.vendor.user_id,
            "hilux_followup",
            thread.id,
            `insert_failed: ${insertErr.message ?? String(insertErr)}`,
          );
          console.error("[my-space-follow-up] insert failed", insertErr);
          skipped++;
          skipReasons.insert_error = (skipReasons.insert_error ?? 0) + 1;
          continue;
        }
        nudged++;
      } catch (innerErr) {
        console.error("[my-space-follow-up] thread loop error", thread.id, innerErr);
        skipped++;
        skipReasons.exception = (skipReasons.exception ?? 0) + 1;
      }
    }

    log("done", { candidates: (candidates ?? []).length, nudged, skipped, skipReasons });
    return ok({ candidates: (candidates ?? []).length, nudged, skipped, skipReasons });
  } catch (err) {
    console.error("[my-space-follow-up] uncaught:", err);
    return ok({ error: err instanceof Error ? err.message : String(err) });
  }
});
