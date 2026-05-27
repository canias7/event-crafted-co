// AI Website Builder — OpenAI hero-image generation.
//
// POST {site_id, prompt} → calls OpenAI gpt-image-2, uploads to the
// ai-site-images storage bucket, returns {image_url}.
//
// Auth: anyone editing the site (matches ai-site-generate's anonymous
// flow). Owner-only when the site has owner_user_id.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const BLOCKED_TERMS = [
  "porn", "pornographic", "xxx", "nude", "nudes", "nsfw", "erotic",
  "kill yourself", "kys", "school shooting", "make a bomb",
  "build a bomb", "child porn", "csam",
  "nigger", "n1gger", "faggot", "kike", "chink", "spic", "tranny",
  "retard",
];
function moderatePrompt(prompt: string): { ok: true } | { ok: false; reason: string } {
  if (!prompt) return { ok: true };
  const n = prompt.toLowerCase();
  for (const t of BLOCKED_TERMS) {
    if (n.includes(t)) return { ok: false, reason: "blocked_content" };
  }
  return { ok: true };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

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

// Try gpt-image-2 first (OpenAI's latest image model — stronger
// detail and composition than gpt-image-1). Fall back to
// gpt-image-1 if the account isn't enabled for the newer model yet,
// so we never hard-fail just because of a model rollout gap.
async function callOpenAI(prompt: string): Promise<{ res: Response; modelUsed: string }> {
  const body = (model: string) => JSON.stringify({
    model,
    prompt,
    n: 1,
    size: "1536x1024",
    quality: "medium",
  });
  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };
  let res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers,
    body: body("gpt-image-2"),
  });
  if (res.status === 400 || res.status === 404) {
    const detail = await res.clone().text().catch(() => "");
    if (/model_not_found|does not exist|invalid_model/i.test(detail)) {
      console.warn("[ai-site-image-generate] gpt-image-2 unavailable, falling back to gpt-image-1");
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers,
        body: body("gpt-image-1"),
      });
      return { res, modelUsed: "gpt-image-1" };
    }
  }
  return { res, modelUsed: "gpt-image-2" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!OPENAI_API_KEY) return json(500, { error: "openai_key_missing" });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const siteId = String(payload?.site_id ?? "").trim();
  const userPrompt = String(payload?.prompt ?? "").trim();
  if (!siteId) return json(400, { error: "missing_site_id" });
  if (!userPrompt) return json(400, { error: "missing_prompt" });
  if (userPrompt.length > 1000) return json(400, { error: "prompt_too_long" });

  const moderation = moderatePrompt(userPrompt);
  if (!moderation.ok) return json(400, { error: moderation.reason });

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

  const fullPrompt =
    "Editorial photograph for an event website hero — beautiful, " +
    "warm lighting, professional composition, photorealistic. Subject: " +
    userPrompt;

  const { res: openaiRes, modelUsed } = await callOpenAI(fullPrompt);

  if (!openaiRes.ok) {
    const detail = await openaiRes.text().catch(() => "");
    console.error("[ai-site-image-generate] openai error", openaiRes.status, detail);
    if (openaiRes.status === 400 && /content_policy|safety/i.test(detail)) {
      return json(400, { error: "content_blocked" });
    }
    return json(502, { error: `openai_${openaiRes.status}` });
  }

  const body = (await openaiRes.json()) as any;
  const b64: string | undefined = body?.data?.[0]?.b64_json;
  if (!b64) {
    console.error("[ai-site-image-generate] no image data in response", body);
    return json(502, { error: "openai_no_image" });
  }

  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const filename = `${s.slug}/${crypto.randomUUID()}.png`;

  const { error: uploadErr } = await admin.storage
    .from("ai-site-images")
    .upload(filename, bytes, {
      contentType: "image/png",
      upsert: false,
    });

  if (uploadErr) {
    console.error("[ai-site-image-generate] upload error", uploadErr);
    return json(500, { error: "upload_failed" });
  }

  const { data: publicUrl } = admin.storage
    .from("ai-site-images")
    .getPublicUrl(filename);

  await admin
    .from("ai_sites")
    .update({ hero_image_url: publicUrl.publicUrl })
    .eq("id", s.id);

  return json(200, { image_url: publicUrl.publicUrl, model: modelUsed });
});
