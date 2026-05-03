// Inquiry decay scanner. Calls expire_stale_inquiries() to flip
// vendor-stale inquiries to 'expired', drop in-app notifications to
// the host, and return rows so we could optionally email the host.
//
// Schedule daily.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AFTER_DAYS = Number.parseInt(
  Deno.env.get("INQUIRY_EXPIRE_AFTER_DAYS") ?? "14",
  10,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Supabase admin credentials not set" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await admin.rpc("expire_stale_inquiries", {
    p_after_days: AFTER_DAYS,
  });
  if (error) return json({ error: error.message }, 500);

  const rows = (data as unknown[] | null) ?? [];
  return json(
    { ok: true, expired: rows.length, after_days: AFTER_DAYS },
    200,
  );
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
