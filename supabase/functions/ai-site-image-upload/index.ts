// AI Website Builder — accept a user-uploaded photo and store it
// for use as a hero / inline image. The builder UI lets the user
// drop or pick a file in chat; this endpoint uploads it to the
// ai-site-images bucket and returns the public URL. The next edit
// prompt then references that URL so Claude swaps the image in.
//
// Multipart POST: image (file), site_id (string).
// Auth: anyone editing the site (matches ai-site-generate semantics).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12MB
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
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

function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return "img";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "invalid_multipart" });
  }

  const siteId = String(form.get("site_id") ?? "").trim();
  const file = form.get("image");
  if (!siteId) return json(400, { error: "missing_site_id" });
  if (!(file instanceof File)) return json(400, { error: "missing_image" });
  if (file.size === 0) return json(400, { error: "empty_image" });
  if (file.size > MAX_IMAGE_BYTES) return json(413, { error: "image_too_large" });
  if (!ALLOWED_MIMES.has(file.type)) {
    return json(400, { error: "unsupported_image_type" });
  }

  // Resolve authed user from JWT.
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

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = mimeToExt(file.type);
  const filename = `${s.slug}/upload-${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await admin.storage
    .from("ai-site-images")
    .upload(filename, bytes, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) {
    console.error("[ai-site-image-upload] upload error", uploadErr);
    return json(500, { error: "upload_failed" });
  }

  const { data: publicUrl } = admin.storage
    .from("ai-site-images")
    .getPublicUrl(filename);

  return json(200, { image_url: publicUrl.publicUrl });
});
