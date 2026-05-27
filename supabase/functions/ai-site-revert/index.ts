// AI Website Builder — undo via chat.
//
// POST {site_id} → revert ai_sites to the last-but-one version (i.e.
// the state before the most recent edit). Returns the now-current
// HTML so the client can re-render the iframe.
//
// Cheap: pure DB shuffle, no AI call.
//
// Auth: same as ai-site-generate's edit path. Owner-only when the
// site has owner_user_id; anonymous sites are editable by anyone
// (testing flow).

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
  if (!siteId) return json(400, { error: "missing_site_id" });

  // Resolve authed user from JWT (if any).
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

  // Load site + check ownership.
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

  // Need at least 2 versions to revert: the current one + a prior.
  const { data: versions, error: vErr } = await admin
    .from("ai_site_versions")
    .select("id, version_number, html, title, prompt, og_description")
    .eq("site_id", siteId)
    .order("version_number", { ascending: false })
    .limit(2);
  if (vErr) {
    console.error("[ai-site-revert] version query failed", vErr);
    return json(500, { error: "version_query_failed" });
  }
  const rows = (versions ?? []) as Array<{
    id: string;
    version_number: number;
    html: string;
    title: string;
    prompt: string | null;
    og_description: string | null;
  }>;
  if (rows.length < 2) {
    return json(400, { error: "nothing_to_undo" });
  }
  const target = rows[1]; // second-newest = previous state.

  // Write the previous version back onto ai_sites. We do NOT delete
  // the newest version row — keep it for forward-redo later.
  // edit_count is decremented so future undos can step further back.
  const { error: updErr } = await admin
    .from("ai_sites")
    .update({
      html: target.html,
      title: target.title,
      prompt: target.prompt,
      og_description: target.og_description,
      edit_count: target.version_number - 1,
    })
    .eq("id", s.id);
  if (updErr) {
    console.error("[ai-site-revert] update failed", updErr);
    return json(500, { error: "revert_failed" });
  }

  // Drop the newest version row so subsequent "undo" steps back
  // further. Without this, the next generate/edit would mint a new
  // higher version on top, and undo from there would land on the
  // version we just reverted to (i.e. no-op).
  await admin
    .from("ai_site_versions")
    .delete()
    .eq("id", rows[0].id);

  return json(200, {
    site_id: s.id,
    slug: s.slug,
    title: target.title,
    html: target.html,
    version_number: target.version_number,
  });
});
