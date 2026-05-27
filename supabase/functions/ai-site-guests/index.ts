// AI Website Builder — guest list manager + personalized link generator.
//
// POST {site_id, action: "list"}                          → returns guests[]
// POST {site_id, action: "bulk_create", guests: [{name, email?}, ...]}
//                                                         → mints tokens, inserts rows
// POST {site_id, action: "delete", guest_id}              → removes one
//
// Each guest gets a 12-char URL-safe token. The public link is
// /s/<slug>?g=<token> — ai-site-render looks the guest up server-side
// and injects the greeting into the HTML before serving.
//
// Auth: owner-only (or anonymous-owned sites — same as rest of builder).

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

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// URL-safe random token. Avoids look-alikes (0/O, 1/l/I) to reduce
// transcription errors when guests share the link verbally.
function mintToken(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const siteId = String(payload?.site_id ?? "").trim();
  const action = String(payload?.action ?? "list");
  if (!siteId) return json(400, { error: "missing_site_id" });

  let authedUserId: string | null = null;
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (bearer && bearer !== SUPABASE_ANON_KEY) {
    try {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data } = await userClient.auth.getUser();
      authedUserId = data?.user?.id ?? null;
    } catch {
      // anon
    }
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: site, error: siteErr } = await admin
    .from("ai_sites")
    .select("id, slug, owner_user_id")
    .eq("id", siteId)
    .maybeSingle();
  if (siteErr || !site) return json(404, { error: "site_not_found" });
  const s = site as { id: string; slug: string; owner_user_id: string | null };
  if (s.owner_user_id && s.owner_user_id !== authedUserId) {
    return json(403, { error: "not_owner" });
  }

  if (action === "list") {
    const { data, error } = await admin
      .from("ai_site_guests")
      .select("id, name, email, token, created_at")
      .eq("site_id", siteId)
      .order("created_at", { ascending: true });
    if (error) return json(500, { error: "list_failed" });
    return json(200, { guests: data ?? [], slug: s.slug });
  }

  if (action === "bulk_create") {
    const incoming = Array.isArray(payload?.guests) ? payload.guests : [];
    if (incoming.length === 0) return json(400, { error: "no_guests_provided" });
    if (incoming.length > 500) return json(400, { error: "too_many_guests" });

    const rows: Array<{
      site_id: string;
      name: string;
      email: string | null;
      token: string;
    }> = [];
    for (const g of incoming) {
      const name = String(g?.name ?? "").trim().slice(0, 120);
      if (!name) continue;
      const email = g?.email ? String(g.email).trim().slice(0, 200) : null;
      rows.push({ site_id: siteId, name, email, token: mintToken() });
    }
    if (rows.length === 0) return json(400, { error: "no_valid_names" });

    const { data, error } = await admin
      .from("ai_site_guests")
      .insert(rows)
      .select("id, name, email, token, created_at");
    if (error) {
      console.error("[ai-site-guests] insert error", error);
      return json(500, { error: "insert_failed" });
    }
    return json(200, { guests: data ?? [], slug: s.slug });
  }

  if (action === "delete") {
    const guestId = String(payload?.guest_id ?? "").trim();
    if (!guestId) return json(400, { error: "missing_guest_id" });
    const { error } = await admin
      .from("ai_site_guests")
      .delete()
      .eq("id", guestId)
      .eq("site_id", siteId);
    if (error) return json(500, { error: "delete_failed" });
    return json(200, { deleted: true });
  }

  return json(400, { error: "invalid_action" });
});
