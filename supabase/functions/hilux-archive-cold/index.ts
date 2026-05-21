// HILUX archive-cold sweep. Daily cron. Closes the loop on
// stale, cold-scored inquiries so the vendor's inbox stays
// honest about which threads are still in play.
//
// Find inquiries that are:
//   - on a vendor whose profile has hilux_action_auto_archive_cold=true
//   - lead_score = 'cold'
//   - last_message_at older than 14 days
//   - status NOT in ('won', 'lost', 'expired')   ← preserve final states
//   - booking_intent_at IS NULL                   ← never archive an
//       inquiry where the host expressed commitment, even if HILUX
//       later scored the convo cold (rare but possible).
// Set status = 'lost'.
//
// Best-effort, idempotent. If the scan finds the same inquiries
// tomorrow (because the status update failed somehow) it just
// flips them again.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STALE_DAYS = 14;
const MAX_PER_RUN = 500;

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const cutoffIso = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();

    // Find inquiry IDs eligible for archive. Join through
    // vendor_profiles → profiles for the per-vendor opt-in flag.
    // Doing this as a single SQL query through PostgREST is awkward
    // (multi-hop with `.in`); easier to pull candidate inquiries
    // first, then filter by owner-profile flag in a second query.
    // lead_score + booking_intent_at moved to inquiry_scores. Join
    // inquiries to inquiry_scores via the FK relationship so we can
    // filter cold + non-booking inquiries in a single PostgREST query.
    const { data: candidates, error } = await admin
      .from("inquiries")
      .select(
        "id, vendor_id, status, last_message_at, vendor_profiles!inner(user_id), inquiry_scores!inner(lead_score, booking_intent_at)",
      )
      .eq("inquiry_scores.lead_score", "cold")
      .lte("last_message_at", cutoffIso)
      .is("inquiry_scores.booking_intent_at", null)
      .not("status", "in", '("won","lost","expired")')
      .limit(MAX_PER_RUN);
    if (error) throw error;

    const inquiries = (candidates ?? []) as Array<{
      id: string;
      vendor_id: string;
      vendor_profiles: { user_id: string };
    }>;
    if (inquiries.length === 0) {
      return ok({ scanned: 0, archived: 0 });
    }

    // Bulk-fetch the relevant profile flags so we don't ping the DB
    // per inquiry.
    const userIds = [...new Set(inquiries.map((i) => i.vendor_profiles.user_id))];
    const { data: profs } = await admin
      .from("profiles")
      .select("id, hilux_action_auto_archive_cold")
      .in("id", userIds);
    const optIn = new Set(
      ((profs ?? []) as Array<{ id: string; hilux_action_auto_archive_cold: boolean }>)
        .filter((p) => p.hilux_action_auto_archive_cold === true)
        .map((p) => p.id),
    );

    const toArchive = inquiries.filter((i) => optIn.has(i.vendor_profiles.user_id));
    if (toArchive.length === 0) {
      return ok({ scanned: inquiries.length, archived: 0, reason: "no_opted_in_vendors" });
    }

    const ids = toArchive.map((i) => i.id);
    const { error: updErr } = await admin
      .from("inquiries")
      .update({ status: "lost" })
      .in("id", ids);
    if (updErr) throw updErr;

    console.log("[hilux-archive-cold] archived", {
      scanned: inquiries.length,
      archived: ids.length,
    });
    return ok({ scanned: inquiries.length, archived: ids.length });
  } catch (err) {
    console.error("[hilux-archive-cold] uncaught:", err);
    return ok({ error: err instanceof Error ? err.message : String(err) });
  }
});
