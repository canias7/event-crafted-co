// AI Website Builder — compose engine endpoint.
//
// POST { spec, save?: boolean, user_id?: string } → returns
//   { html, slug, site_id?, validation }
//
// Optional `save=true` writes a row to ai_sites and snapshots a
// version, so the builder UI can switch over from ai-site-generate
// for new generations. When `save` is omitted we just return the
// composed HTML for preview-only flows.
//
// Why this exists: composing from a structured spec takes a few
// milliseconds vs the ~3-5 min Claude takes to write the HTML
// directly. Claude is upstream (ai-site-generate-spec, coming
// soon); this function is pure data → HTML.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { compose, type Spec } from "../_shared/site_templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DESIGN_BIBLE_VERSION = "tpl-v1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "site";
  return `${base}-${Math.random().toString(16).slice(2, 8)}`;
}

function validateSpec(spec: any): { ok: true; spec: Spec } | { ok: false; error: string } {
  if (!spec || typeof spec !== "object") return { ok: false, error: "spec_required" };
  if (typeof spec.title !== "string" || !spec.title.trim()) return { ok: false, error: "title_required" };
  if (typeof spec.theme !== "string") return { ok: false, error: "theme_required" };
  if (typeof spec.event_type !== "string") return { ok: false, error: "event_type_required" };
  if (!Array.isArray(spec.sections)) return { ok: false, error: "sections_required" };
  return { ok: true, spec: spec as Spec };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

  const v = validateSpec(payload?.spec);
  if (!v.ok) return json(400, { error: v.error });
  const spec = v.spec;

  // Resolve signed-in user for ownership.
  let authedUserId: string | null = null;
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
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

  // Edit existing site: load row, validate ownership, reuse slug.
  let existing: { id: string; slug: string; edit_count: number; owner_user_id: string | null } | null = null;
  if (typeof payload?.edit_site_id === "string" && payload.edit_site_id) {
    const { data } = await admin
      .from("ai_sites")
      .select("id, slug, edit_count, owner_user_id")
      .eq("id", payload.edit_site_id)
      .maybeSingle();
    if (!data) return json(404, { error: "site_not_found" });
    existing = data as any;
    if (existing!.owner_user_id && existing!.owner_user_id !== authedUserId) {
      return json(403, { error: "not_owner" });
    }
  }

  const slug = existing ? existing.slug : slugify(spec.title);
  let html = compose({ spec, supabaseUrl: SUPABASE_URL, designBibleVersion: DESIGN_BIBLE_VERSION });
  html = html.replaceAll("__SUPABASE_URL__", SUPABASE_URL).replaceAll("__SLUG__", slug);

  const ogDescription = spec.meta_description ?? `${spec.title} — RSVP and event details.`;

  // If save=false, just return the HTML for preview.
  if (payload?.save === false) {
    return json(200, { html, slug, saved: false });
  }

  // Save: upsert row + snapshot version.
  let savedSiteId: string;
  let newVersion: number;
  if (existing) {
    newVersion = (existing.edit_count ?? 0) + 2;
    const { error } = await admin
      .from("ai_sites")
      .update({
        title: spec.title,
        html,
        prompt: payload?.prompt ?? "(composed from spec)",
        og_description: ogDescription,
        edit_count: (existing.edit_count ?? 0) + 1,
      })
      .eq("id", existing.id);
    if (error) {
      console.error("[ai-site-compose] update error", error);
      return json(500, { error: "save_failed" });
    }
    savedSiteId = existing.id;
  } else {
    newVersion = 1;
    const { data: inserted, error } = await admin
      .from("ai_sites")
      .insert({
        slug,
        title: spec.title,
        prompt: payload?.prompt ?? "(composed from spec)",
        html,
        og_description: ogDescription,
        owner_user_id: authedUserId,
      })
      .select("id")
      .maybeSingle();
    if (error || !inserted) {
      console.error("[ai-site-compose] insert error", error);
      return json(500, { error: "save_failed" });
    }
    savedSiteId = (inserted as { id: string }).id;
  }

  // Version snapshot (best-effort).
  await admin.from("ai_site_versions").insert({
    site_id: savedSiteId,
    version_number: newVersion,
    html,
    title: spec.title,
    prompt: payload?.prompt ?? "(composed from spec)",
    og_description: ogDescription,
  }).catch((e: any) => console.warn("[ai-site-compose] version snapshot", e));

  return json(200, {
    html,
    slug,
    site_id: savedSiteId,
    version_number: newVersion,
    saved: true,
    validation: { ok: true, issues: [] },
  });
});
