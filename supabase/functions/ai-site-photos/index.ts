// AI Website Builder — guest photo album.
//
// Public POST (multipart):
//   slug, file, name, caption?
//   → server-side service-role upload to ai-site-images/guest/<slug>/
//   → inserts ai_site_photos row, returns a thank-you page.
//
// Owner POST (JSON):
//   {site_id, action: "list"}                  → returns photos[]
//   {site_id, action: "delete", photo_id}      → deletes one (and storage)
//   {site_id, action: "moderate", photo_id, approved} → flip approval
//
// Auth:
// - Public upload: no auth. We validate slug → site row, enforce size
//   + content-type limits, write via service role.
// - Owner list/delete: owner-only via JWT.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_PHOTO_BYTES = 12 * 1024 * 1024; // 12 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

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

function thankYouPage(slug: string): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, "");
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Photo added</title>
<style>body{font-family:Georgia,serif;background:#1a1a1a;color:#f5ead5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center}.c{max-width:380px}h1{font-style:italic;font-size:1.8rem;margin:0 0 0.75rem;color:#c9a86a}p{opacity:0.7;line-height:1.6;margin:0 0 1.5rem}a{display:inline-block;color:#c9a86a;border:1px solid #c9a86a;padding:0.6rem 1.4rem;border-radius:999px;text-decoration:none;font-size:0.85rem;letter-spacing:0.1em}</style>
</head><body><div class="c"><h1>Thank you</h1><p>Your photo is in the album.</p><a href="/s/${safe}">Back to the site</a></div></body></html>`;
}

function errorPage(message: string, slug = ""): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, "");
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Couldn't upload</title>
<style>body{font-family:Georgia,serif;background:#1a1a1a;color:#f5ead5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center}.c{max-width:380px}h1{font-size:1.5rem;margin:0 0 0.75rem;color:#c9a86a}p{opacity:0.7;line-height:1.6;margin:0 0 1.5rem}a{display:inline-block;color:#c9a86a;border:1px solid #c9a86a;padding:0.6rem 1.4rem;border-radius:999px;text-decoration:none;font-size:0.85rem}</style>
</head><body><div class="c"><h1>Couldn't upload</h1><p>${message}</p>${safe ? `<a href="/s/${safe}">Back to the site</a>` : ""}</div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const contentType = req.headers.get("content-type") ?? "";
  const isForm = contentType.includes("multipart/form-data");

  // --- PUBLIC MULTIPART UPLOAD PATH ---
  if (isForm) {
    let form: FormData;
    try { form = await req.formData(); } catch {
      return new Response(errorPage("Bad upload"), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8", ...cors } });
    }
    const slug = (form.get("slug") ?? new URL(req.url).searchParams.get("slug") ?? "").toString().trim();
    const uploaderName = String(form.get("name") ?? "").trim().slice(0, 80) || null;
    const caption = String(form.get("caption") ?? "").trim().slice(0, 280) || null;
    const file = form.get("file");

    if (!slug || !file || !(file instanceof File)) {
      return new Response(errorPage("Missing photo or site reference.", slug), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8", ...cors } });
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return new Response(errorPage("Photo is too large (max 12MB).", slug), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8", ...cors } });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return new Response(errorPage("That file type isn't allowed.", slug), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8", ...cors } });
    }

    const { data: site } = await admin
      .from("ai_sites")
      .select("id, slug, is_blocked")
      .eq("slug", slug)
      .maybeSingle();
    if (!site || (site as any).is_blocked) {
      return new Response(errorPage("Site not found.", slug), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", ...cors } });
    }
    const s = site as { id: string; slug: string };

    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5).replace(/[^a-z0-9]/g, "") || "jpg";
    const filename = `guest/${s.slug}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await admin.storage
      .from("ai-site-images")
      .upload(filename, bytes, { contentType: file.type, upsert: false });
    if (upErr) {
      console.error("[ai-site-photos] upload error", upErr);
      return new Response(errorPage("Couldn't save the photo. Try again.", s.slug), { status: 500, headers: { "Content-Type": "text/html; charset=utf-8", ...cors } });
    }
    const { data: pub } = admin.storage.from("ai-site-images").getPublicUrl(filename);
    const photoUrl = pub?.publicUrl ?? "";

    await admin.from("ai_site_photos").insert({
      site_id: s.id,
      photo_url: photoUrl,
      uploader_name: uploaderName,
      caption,
      approved: true,
    });

    return new Response(thankYouPage(s.slug), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", ...cors },
    });
  }

  // --- OWNER JSON PATHS (list / delete / moderate) ---
  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const action = String(payload?.action ?? "list");
  const siteId = String(payload?.site_id ?? "").trim();
  if (!siteId) return json(400, { error: "missing_site_id" });

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
      .from("ai_site_photos")
      .select("id, photo_url, uploader_name, caption, approved, uploaded_at")
      .eq("site_id", siteId)
      .order("uploaded_at", { ascending: false })
      .limit(500);
    if (error) return json(500, { error: "list_failed" });
    return json(200, { photos: data ?? [] });
  }

  if (action === "delete") {
    const photoId = String(payload?.photo_id ?? "").trim();
    if (!photoId) return json(400, { error: "missing_photo_id" });
    // Look up storage path from URL so we can delete the file too.
    const { data: row } = await admin
      .from("ai_site_photos")
      .select("photo_url")
      .eq("id", photoId)
      .eq("site_id", siteId)
      .maybeSingle();
    const photoUrl = (row as { photo_url?: string } | null)?.photo_url ?? "";
    const m = photoUrl.match(/\/ai-site-images\/(.+)$/);
    if (m) {
      await admin.storage.from("ai-site-images").remove([m[1]]).catch(() => undefined);
    }
    const { error } = await admin
      .from("ai_site_photos")
      .delete()
      .eq("id", photoId)
      .eq("site_id", siteId);
    if (error) return json(500, { error: "delete_failed" });
    return json(200, { deleted: true });
  }

  if (action === "moderate") {
    const photoId = String(payload?.photo_id ?? "").trim();
    if (!photoId) return json(400, { error: "missing_photo_id" });
    const approved = !!payload?.approved;
    const { error } = await admin
      .from("ai_site_photos")
      .update({ approved })
      .eq("id", photoId)
      .eq("site_id", siteId);
    if (error) return json(500, { error: "moderate_failed" });
    return json(200, { ok: true });
  }

  return json(400, { error: "invalid_action" });
});
