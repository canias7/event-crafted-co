// Axion image edge function. The vendor uploads a listing photo and
// picks a style; Axion sends it to OpenAI's gpt-image-1 edit endpoint
// and returns restyled variants.
//
// Stateless for v1 — nothing is persisted. The panel shows the
// returned variants for the vendor to download. Persistence +
// save-to-gallery is a planned follow-up.
//
// Auth: vendor JWT (verify_jwt=true).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
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

// Accept a data URL ("data:image/jpeg;base64,...") or bare base64.
function decodeImage(input: string): { bytes: Uint8Array; mime: string } | null {
  let b64 = input.trim();
  let mime = "image/png";
  const m = b64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
  if (m) {
    mime = m[1];
    b64 = m[2];
  }
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return bytes.length > 0 ? { bytes, mime } : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return json(401, { error: "missing_authorization" });
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: "invalid_session" });

    if (!OPENAI_API_KEY) return json(500, { error: "openai_key_missing" });

    const payload = await req.json().catch(() => ({}));
    const userPrompt = String(payload?.prompt ?? "").trim();
    if (!userPrompt) return json(400, { error: "missing_prompt" });
    // Wrap the vendor's free-text direction with guardrails so the
    // edit stays a realistic listing photo, not an AI-looking render.
    const prompt =
      "Edit this event-vendor listing photo. Apply the direction below while keeping the real subject, composition, and details intact — keep it photorealistic and natural, never artificial or AI-looking. Direction: " +
      userPrompt.slice(0, 1000);

    const decoded = decodeImage(String(payload?.image ?? ""));
    if (!decoded) return json(400, { error: "invalid_image" });
    // Headroom under OpenAI's 50MB-per-image edit limit.
    if (decoded.bytes.length > 20 * 1024 * 1024) {
      return json(413, { error: "image_too_large" });
    }

    const subtype = decoded.mime.split("/")[1] ?? "png";
    const ext = subtype === "jpeg" ? "jpg" : subtype;
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append(
      "image",
      new Blob([decoded.bytes], { type: decoded.mime }),
      `source.${ext}`,
    );
    form.append("prompt", prompt);
    form.append("n", "2");
    form.append("size", "1024x1024");
    form.append("quality", "medium");

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("[axion-generate] openai error", res.status, detail);
      return json(502, {
        error: "openai_error",
        status: res.status,
        detail: detail.slice(0, 300),
      });
    }
    const out = await res.json();
    const variants = ((out?.data ?? []) as Array<{ b64_json?: string }>)
      .map((d) => d.b64_json)
      .filter((b): b is string => typeof b === "string" && b.length > 0)
      .map((b) => `data:image/png;base64,${b}`);
    if (variants.length === 0) return json(502, { error: "no_variants" });

    return json(200, { variants });
  } catch (err) {
    console.error("[axion-generate] uncaught", err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
