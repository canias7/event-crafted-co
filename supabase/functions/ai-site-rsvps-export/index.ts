// AI Website Builder — export RSVPs as CSV for the owner.
//
// POST {site_id} → returns text/csv with the columns:
//   submitted_at, guest_name, guest_email, attending, guests_count,
//   meal_choice, plus_one_name, plus_one_meal, message
//
// Auth: owner-only when the site has owner_user_id. Anonymous sites
// (owner_user_id IS NULL) can be exported by anyone — matches the
// rest of the builder's anonymous flow.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const siteId = String(payload?.site_id ?? "").trim();
  if (!siteId) {
    return new Response(JSON.stringify({ error: "missing_site_id" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let authedUserId: string | null = null;
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (bearer && bearer !== SUPABASE_ANON_KEY) {
    try {
      const uc = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data } = await uc.auth.getUser();
      authedUserId = data?.user?.id ?? null;
    } catch { /* anon */ }
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: site, error: siteErr } = await admin
    .from("ai_sites")
    .select("id, slug, owner_user_id, title")
    .eq("id", siteId)
    .maybeSingle();
  if (siteErr || !site) {
    return new Response(JSON.stringify({ error: "site_not_found" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const s = site as { id: string; slug: string; owner_user_id: string | null; title: string };
  if (s.owner_user_id && s.owner_user_id !== authedUserId) {
    return new Response(JSON.stringify({ error: "not_owner" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: rsvps, error: rsvpErr } = await admin
    .from("ai_site_rsvps")
    .select("created_at, guest_name, guest_email, attending, guests_count, meal_choice, plus_one_name, plus_one_meal, message")
    .eq("site_id", siteId)
    .order("created_at", { ascending: true });
  if (rsvpErr) {
    return new Response(JSON.stringify({ error: "query_failed" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const rows = (rsvps ?? []) as Array<{
    created_at: string;
    guest_name: string | null;
    guest_email: string | null;
    attending: string | null;
    guests_count: number | null;
    meal_choice: string | null;
    plus_one_name: string | null;
    plus_one_meal: string | null;
    message: string | null;
  }>;

  const header = "submitted_at,guest_name,guest_email,attending,guests_count,meal_choice,plus_one_name,plus_one_meal,message\n";
  const body = rows.map((r) =>
    [
      csvEscape(r.created_at),
      csvEscape(r.guest_name),
      csvEscape(r.guest_email),
      csvEscape(r.attending),
      csvEscape(r.guests_count ?? 1),
      csvEscape(r.meal_choice),
      csvEscape(r.plus_one_name),
      csvEscape(r.plus_one_meal),
      csvEscape(r.message),
    ].join(",")
  ).join("\n");

  const filename = `${s.slug}-rsvps-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(header + body + "\n", {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
