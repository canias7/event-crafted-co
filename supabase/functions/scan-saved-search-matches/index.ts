// Saved-search match scanner. Calls enqueue_saved_search_matches() which
// finds vendor_profiles created since each saved search's last_notified_at
// that match the saved filters, drops in-app notifications, and updates
// last_notified_at atomically.
//
// In-app for everyone, plus email for searches where the host opted in
// via email_alerts_enabled (the SavedSearchesPage UI exposes a toggle
// per search). Default is in-app only — opt-in keeps the volume calm.
//
// Schedule daily (or hourly if your sign-up volume warrants it).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface MatchRow {
  saved_search_id: string;
  host_id: string;
  host_email: string | null;
  search_name: string;
  match_count: number;
  email_alerts_enabled: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Supabase admin credentials not set" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await admin.rpc("enqueue_saved_search_matches");
  if (error) return json({ error: error.message }, 500);

  const rows = (data as MatchRow[] | null) ?? [];

  // Email fan-out for opted-in searches. In-app notifications already
  // happened inside the RPC; here we add the email as a second channel.
  let emailed = 0;
  for (const r of rows) {
    if (!r.email_alerts_enabled || !r.host_email) continue;
    const res = await admin.functions.invoke("send-transactional-email", {
      body: {
        kind: "saved_search_match",
        to: r.host_email,
        searchName: r.search_name,
        matchCount: r.match_count,
        searchId: r.saved_search_id,
      },
    });
    if (!res.error) emailed++;
  }

  return json(
    { ok: true, notified: rows.length, emailed },
    200,
  );
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
