// Axion image edge function. Two modes:
//   generate — text-to-image: a prompt becomes brand-new listing
//              photos (OpenAI gpt-image-1 generations).
//   edit     — image-to-image: an uploaded photo is restyled per a
//              prompt (gpt-image-1 edits).
//
// Stateless — variants are returned for the panel to show/save.
// Auth: vendor JWT (verify_jwt=true).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  consumeCredits,
  refundCredits,
  insufficientCreditsResponse,
} from "../_shared/credits.ts";
import { logImageUsage } from "../_shared/ai-usage.ts";

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
  // Track the user we charged so the outer catch can refund if the
  // OpenAI call throws after we've already debited credits.
  let chargedUserId: string | null = null;
  let chargedRef: string | null = null;
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

    // Vendor-only: Axion bills against the org's OpenAI key, so a
    // logged-in non-vendor (host, test user) must not be able to
    // burn quota here. Self-read works via the profiles owner-select
    // RLS policy.
    const { data: profileRow, error: profErr } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (
      profErr ||
      (profileRow as { role?: string } | null)?.role !== "vendor"
    ) {
      return json(403, { error: "vendor_only" });
    }

    if (!OPENAI_API_KEY) return json(500, { error: "openai_key_missing" });

    const payload = await req.json().catch(() => ({}));
    const mode = payload?.mode === "generate" ? "generate" : "edit";
    const userPrompt = String(payload?.prompt ?? "").trim();
    if (!userPrompt) return json(400, { error: "missing_prompt" });
    const direction = userPrompt.slice(0, 1000);

    // Charge credits BEFORE the OpenAI call. 10 credits per Axion
    // request — single 1024×1024 medium-quality image from
    // gpt-image-1, cost-to-serve ≈ $0.042 vs $0.24+ retail
    // (~83% margin at the lowest top-up tier).
    const consume = await consumeCredits(
      userData.user.id,
      "axion_image",
      mode,
    );
    if (!consume.ok) {
      if (consume.reason === "insufficient_credits") {
        return insufficientCreditsResponse(consume.cost, cors);
      }
      return json(503, { error: "credit_service_unavailable" });
    }
    chargedUserId = userData.user.id;
    chargedRef = mode;

    let res: Response;
    if (mode === "generate") {
      // Text-to-image: a brand-new listing photo from a description.
      const prompt =
        "Create a photorealistic, editorial-quality photo for an event vendor's marketplace listing. It must look like a real photograph — never an illustration, 3D render, or obviously AI-generated image. Subject: " +
        direction;
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          n: 1,
          size: "1024x1024",
          quality: "medium",
        }),
      });
    } else {
      // Image-to-image: restyle the vendor's uploaded photo.
      const rawInput = String(payload?.image ?? "");
      // Reject oversize base64 BEFORE atob — base64 expands by
      // ~4/3, so a 20MB byte budget caps the encoded string at
      // ~28MB. atob would otherwise allocate the entire decoded
      // buffer in one shot, opening a DoS surface.
      if (rawInput.length > 28 * 1024 * 1024) {
        return json(413, { error: "image_too_large" });
      }
      const decoded = decodeImage(rawInput);
      if (!decoded) return json(400, { error: "invalid_image" });
      // Defense in depth (smaller actual byte budget post-decode).
      if (decoded.bytes.length > 20 * 1024 * 1024) {
        return json(413, { error: "image_too_large" });
      }
      const prompt =
        "Edit this event-vendor listing photo. Apply the direction below while keeping the real subject, composition, and details intact — keep it photorealistic and natural, never artificial or AI-looking. Direction: " +
        direction;
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
      form.append("n", "1");
      form.append("size", "1024x1024");
      form.append("quality", "medium");
      res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
      });
    }

    if (!res.ok) {
      // OpenAI error bodies often contain the failing prompt,
      // model internals, and account context. Log them for
      // debugging but do NOT return them to the client.
      const detail = await res.text();
      console.error("[axion-generate] openai error", mode, res.status, detail);
      void logImageUsage({
        userId: chargedUserId,
        actionType: "axion_image",
        model: "gpt-image-1",
        spec: "gpt-image-1:1024x1024:medium",
        imageCount: 0,
        refId: chargedRef,
        success: false,
        errorMessage: `openai_${res.status}`,
      });
      await refundCredits(
        chargedUserId,
        "axion_image",
        chargedRef,
        `openai_${res.status}`,
      );
      chargedUserId = null;
      return json(502, { error: "openai_error", status: res.status });
    }
    const out = await res.json();
    const variants = ((out?.data ?? []) as Array<{ b64_json?: string }>)
      .map((d) => d.b64_json)
      .filter((b): b is string => typeof b === "string" && b.length > 0)
      .map((b) => `data:image/png;base64,${b}`);
    if (variants.length === 0) {
      void logImageUsage({
        userId: chargedUserId,
        actionType: "axion_image",
        model: "gpt-image-1",
        spec: "gpt-image-1:1024x1024:medium",
        imageCount: 0,
        refId: chargedRef,
        success: false,
        errorMessage: "no_variants",
      });
      await refundCredits(chargedUserId, "axion_image", chargedRef, "no_variants");
      chargedUserId = null;
      return json(502, { error: "no_variants" });
    }

    // Successful path: log the realized image count from OpenAI
    // (we send n=1; log whatever came back).
    void logImageUsage({
      userId: chargedUserId,
      actionType: "axion_image",
      model: "gpt-image-1",
      spec: "gpt-image-1:1024x1024:medium",
      imageCount: variants.length,
      refId: chargedRef,
    });

    return json(200, { variants, credits_remaining: consume.balance });
  } catch (err) {
    if (chargedUserId) {
      await refundCredits(
        chargedUserId,
        "axion_image",
        chargedRef,
        `exception: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    console.error("[axion-generate] uncaught", err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
