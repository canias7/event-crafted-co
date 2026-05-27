// AI Website Builder — version history list + restore-to-version.
//
// POST {site_id, action: "list"}                   → returns versions[]
// POST {site_id, action: "restore", version_number} → copies that
//      version's html/title back onto ai_sites and returns the new
//      state. Subsequent versions (newer than the restore target) are
//      removed so the version timeline stays linear.
//
// Auth: owner-only when the site has owner_user_id. Anonymous sites
// (owner_user_id IS NULL) are restorable by anyone, matching the rest
// of the builder flow.

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
      .from("ai_site_versions")
      .select("version_number, prompt, created_at")
      .eq("site_id", siteId)
      .order("version_number", { ascending: false })
      .limit(50);
    if (error) return json(500, { error: "list_failed" });
    return json(200, { versions: data ?? [] });
  }

  if (action === "restore") {
    const versionNumber = Number(payload?.version_number);
    if (!Number.isFinite(versionNumber)) {
      return json(400, { error: "missing_version_number" });
    }

    const { data: target, error: targetErr } = await admin
      .from("ai_site_versions")
      .select("html, title, prompt, og_description, version_number")
      .eq("site_id", siteId)
      .eq("version_number", versionNumber)
      .maybeSingle();
    if (targetErr || !target) return json(404, { error: "version_not_found" });
    const t = target as {
      html: string;
      title: string;
      prompt: string | null;
      og_description: string | null;
      version_number: number;
    };

    const { error: updateErr } = await admin
      .from("ai_sites")
      .update({
        html: t.html,
        title: t.title,
        prompt: t.prompt,
        og_description: t.og_description,
        edit_count: Math.max(0, t.version_number - 1),
      })
      .eq("id", s.id);
    if (updateErr) return json(500, { error: "restore_failed" });

    // Drop any newer version rows so the timeline stays linear (next
    // generate/edit appends from the restored point).
    await admin
      .from("ai_site_versions")
      .delete()
      .eq("site_id", siteId)
      .gt("version_number", t.version_number);

    return json(200, {
      site_id: s.id,
      slug: s.slug,
      title: t.title,
      html: t.html,
      version_number: t.version_number,
    });
  }

  return json(400, { error: "invalid_action" });
});
