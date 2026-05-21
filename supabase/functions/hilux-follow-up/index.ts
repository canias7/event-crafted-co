// HILUX follow-up scanner. Runs daily via pg_cron.
//
// Finds threads where HILUX (or the vendor) sent the last message
// 2–3 days ago and the host hasn't replied. Sends one gentle nudge
// per thread. Marketing copy already promises "drafts you the perfect
// follow-up two days later" — this delivers it.
//
// Guards:
//   - HILUX must be enabled on the vendor + not paused on the thread
//   - The last message must be from the VENDOR side (we don't nudge
//     after the host already replied; that's their turn to step up)
//   - We never nudge the same thread twice in 5 days (recency check
//     on previous hilux follow-up messages)
//
// Replies are inserted with sender_role='vendor' + is_hilux_generated=true
// so the inbox treats them like any other HILUX message.

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

// Window for "last activity": at least this many days ago, but not
// older than the upper bound (so we don't try to revive months-dead
// threads).
const MIN_AGE_DAYS = 2;
const MAX_AGE_DAYS = 4;
// Don't double-nudge within this many days of the last HILUX follow-up.
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
  console.log("[hilux-follow-up]", ...args);
}

interface ThreadRow {
  id: string;
  vendor_id: string;
  inquiry_id: string | null;
  last_message_at: string;
  hilux_paused: boolean;
  vendor_profiles: {
    hilux_enabled: boolean;
  } | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const now = Date.now();
    const minAgeIso = new Date(now - MIN_AGE_DAYS * 86400000).toISOString();
    const maxAgeIso = new Date(now - MAX_AGE_DAYS * 86400000).toISOString();
    const cooldownIso = new Date(now - COOLDOWN_DAYS * 86400000).toISOString();

    // Threads whose last activity falls inside the nudge window AND
    // belong to a HILUX-enabled vendor AND aren't paused.
    const { data: candidates, error: candErr } = await admin
      .from("direct_threads")
      .select(
        "id, vendor_id, inquiry_id, last_message_at, hilux_paused, vendor_profiles!inner(hilux_enabled)",
      )
      .gte("last_message_at", maxAgeIso)
      .lte("last_message_at", minAgeIso)
      .eq("hilux_paused", false)
      .eq("vendor_profiles.hilux_enabled", true)
      .order("last_message_at", { ascending: true })
      .limit(MAX_THREADS_PER_RUN);
    if (candErr) throw candErr;

    let nudged = 0;
    let skipped = 0;
    const skipReasons: Record<string, number> = {};

    for (const thread of (candidates ?? []) as ThreadRow[]) {
      try {
        // Must have at least one host message and the LATEST message
        // must be from the vendor side (i.e., we're waiting on the
        // host). If the latest message is from the host, the host is
        // the one being "silent"-waited-on, but actually we want the
        // opposite: host already replied = no follow-up needed.
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

        // Cooldown: don't follow up if we already sent a HILUX
        // follow-up in this thread recently. We check the last few
        // messages for an is_hilux_generated row newer than the
        // cooldown threshold.
        const { data: recentHilux } = await admin
          .from("direct_messages")
          .select("created_at")
          .eq("thread_id", thread.id)
          .eq("is_hilux_generated", true)
          .gte("created_at", cooldownIso)
          .order("created_at", { ascending: false })
          .limit(1);
        if ((recentHilux ?? []).length > 0) {
          // Only count as cooldown if there's a HILUX row but the
          // last vendor message is older — i.e., we already nudged
          // and are waiting again.
          const lastHiluxAt = new Date(
            (recentHilux ?? [])[0].created_at,
          ).getTime();
          const lastMsgAt = new Date(last.created_at).getTime();
          // If the latest message IS the HILUX one and it's inside
          // the cooldown window, don't send another nudge.
          if (lastHiluxAt >= lastMsgAt - 1000) {
            skipped++;
            skipReasons.cooldown = (skipReasons.cooldown ?? 0) + 1;
            continue;
          }
        }

        const ctx = await loadVendorContext(admin, thread.vendor_id);
        if (!ctx.vendor || !ctx.vendor.user_id || !ctx.vendor.hilux_enabled) {
          skipped++;
          skipReasons.vendor_missing =
            (skipReasons.vendor_missing ?? 0) + 1;
          continue;
        }

        // Load history for context. We feed it to Claude with an
        // explicit instruction: "Now write a single short follow-up
        // nudge to the host." The system prompt is the same; we just
        // append a synthetic user-side instruction at the end.
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

        const claudeMessages = ordered.map((m) => ({
          role: (m.sender_role === "host" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: m.body,
        }));
        // Append a synthetic "user" turn instructing the follow-up
        // explicitly. This gives Claude a target without polluting
        // the system prompt for the normal-reply path.
        claudeMessages.push({
          role: "user",
          content:
            "[SYSTEM] The host has been silent for a few days. Write ONE short, friendly follow-up nudge (1–2 sentences max) in the same language as the previous conversation. Don't repeat what you already said. Don't be pushy. Reference any concrete next step that's natural (a date, a package, an open question they didn't answer). If you can't think of a useful nudge, output \"ESCALATE: silent_no_useful_nudge\" instead.",
        });

        const reply = await callClaude(
          ANTHROPIC_API_KEY,
          systemText,
          claudeMessages,
        );

        // Honor ESCALATE in the follow-up path too — just skip
        // silently. Don't nudge if Claude says there's nothing to say.
        if (/^\s*ESCALATE\s*:/i.test(reply)) {
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
          console.error("[hilux-follow-up] insert failed", insertErr);
          skipped++;
          skipReasons.insert_error = (skipReasons.insert_error ?? 0) + 1;
          continue;
        }
        nudged++;
      } catch (innerErr) {
        console.error(
          "[hilux-follow-up] thread loop error",
          thread.id,
          innerErr,
        );
        skipped++;
        skipReasons.exception = (skipReasons.exception ?? 0) + 1;
      }
    }

    log("done", {
      candidates: (candidates ?? []).length,
      nudged,
      skipped,
      skipReasons,
    });
    return ok({
      candidates: (candidates ?? []).length,
      nudged,
      skipped,
      skipReasons,
    });
  } catch (err) {
    console.error("[hilux-follow-up] uncaught:", err);
    return ok({ error: err instanceof Error ? err.message : String(err) });
  }
});
