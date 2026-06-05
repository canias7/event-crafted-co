// My Space auto-archive-cold scanner. Daily cron.
//
// Closes inquiries that have gone cold: My Space-enabled vendor, thread
// not paused, no activity for COLD_DAYS, and the inquiry still in an
// open state ('new' or 'replied'). Flips the inquiry to 'closed' and
// writes one hilux_action_log row per close so it shows up in the
// vendor's activity view + the MCP connector's get_action_log tool.
//
// Conservative by design: only very stale threads (30d default) and no
// host-facing message is sent — we just close the lead out. No Claude
// call, so no credits are consumed.
//
// NOTE: the original HILUX archive-cold cron pointed at a function that
// had no source in the repo (orphaned). This is a fresh, minimal
// implementation of that intent, powered by My Space.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { loadVendorContext } from "../_shared/hilux-prompt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const COLD_DAYS = 30;
const MAX_THREADS_PER_RUN = 100;
const OPEN_STATUSES = ["new", "replied"];

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
  console.log("[my-space-archive-cold]", ...args);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const now = Date.now();
    const coldIso = new Date(now - COLD_DAYS * 86400000).toISOString();

    // Candidate threads = thread not paused + no activity for COLD_DAYS.
    // The hilux_enabled gate is applied per-thread below via
    // loadVendorContext (joining through profiles here would be hairy).
    const { data: candidates, error: candErr } = await admin
      .from("direct_threads")
      .select("id, vendor_id, inquiry_id, last_message_at, hilux_paused")
      .lte("last_message_at", coldIso)
      .eq("hilux_paused", false)
      .not("inquiry_id", "is", null)
      .order("last_message_at", { ascending: true })
      .limit(MAX_THREADS_PER_RUN);
    if (candErr) throw candErr;

    let archived = 0;
    let skipped = 0;
    const skipReasons: Record<string, number> = {};

    for (const thread of (candidates ?? []) as Array<{
      id: string;
      vendor_id: string;
      inquiry_id: string | null;
      last_message_at: string;
    }>) {
      try {
        if (!thread.inquiry_id) {
          skipped++;
          skipReasons.no_inquiry = (skipReasons.no_inquiry ?? 0) + 1;
          continue;
        }

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

        // Only close inquiries still in an open state. Skip anything
        // already closed/declined/won/lost so we never re-touch a
        // resolved lead.
        const { data: inq } = await admin
          .from("inquiries")
          .select("id, status")
          .eq("id", thread.inquiry_id)
          .maybeSingle();
        if (!inq) {
          skipped++;
          skipReasons.inquiry_missing = (skipReasons.inquiry_missing ?? 0) + 1;
          continue;
        }
        if (!OPEN_STATUSES.includes(String((inq as any).status ?? ""))) {
          skipped++;
          skipReasons.not_open = (skipReasons.not_open ?? 0) + 1;
          continue;
        }

        const { error: updErr } = await admin
          .from("inquiries")
          .update({ status: "closed" })
          .eq("id", thread.inquiry_id);
        if (updErr) {
          console.error("[my-space-archive-cold] status update failed", updErr);
          skipped++;
          skipReasons.update_error = (skipReasons.update_error ?? 0) + 1;
          continue;
        }

        const { error: logErr } = await admin.from("hilux_action_log").insert({
          user_id: ctx.vendor.user_id,
          vendor_id: ctx.vendor.id,
          thread_id: thread.id,
          inquiry_id: thread.inquiry_id,
          message_id: null,
          action: "archive_cold",
          detail: `No activity for ${COLD_DAYS}+ days — closed automatically.`,
        });
        if (logErr) {
          console.error("[my-space-archive-cold] action log insert failed", logErr);
        }
        archived++;
      } catch (innerErr) {
        console.error("[my-space-archive-cold] thread loop error", thread.id, innerErr);
        skipped++;
        skipReasons.exception = (skipReasons.exception ?? 0) + 1;
      }
    }

    log("done", { candidates: (candidates ?? []).length, archived, skipped, skipReasons });
    return ok({ candidates: (candidates ?? []).length, archived, skipped, skipReasons });
  } catch (err) {
    console.error("[my-space-archive-cold] uncaught:", err);
    return ok({ error: err instanceof Error ? err.message : String(err) });
  }
});
