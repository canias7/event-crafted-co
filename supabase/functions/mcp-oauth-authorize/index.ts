// OAuth 2.1 authorization endpoint.
//
// GET  /mcp-oauth-authorize?client_id=...&redirect_uri=...&...
//      Validates params, then 302-redirects the browser to the
//      frontend consent page with the same params preserved. The
//      consent page handles login + Approve/Deny.
//
// POST /mcp-oauth-authorize (Authorization: Bearer <vendor JWT>)
//      Called by the frontend consent page after the user clicks
//      Approve. Validates params again, mints a short-lived
//      authorization code bound to the user, stores its hash, and
//      returns the redirect_uri (with ?code=…&state=…) that the
//      browser should send the user to.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";
const AUTH_CODE_TTL_MS = 60_000;
const ALLOWED_SCOPES = new Set(["read_only", "read_write"]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function randomB64Url(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function validateClient(
  admin: any,
  clientId: string,
  redirectUri: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: client } = await admin
    .from("oauth_clients")
    .select("client_id, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!client) return { ok: false, error: "unauthorized_client" };
  const allowed = (client as { redirect_uris: string[] }).redirect_uris ?? [];
  if (!allowed.includes(redirectUri)) {
    return { ok: false, error: "invalid_redirect_uri" };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const clientId = url.searchParams.get("client_id") ?? "";
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const responseType = url.searchParams.get("response_type") ?? "";
    const codeChallenge = url.searchParams.get("code_challenge") ?? "";
    const codeChallengeMethod =
      url.searchParams.get("code_challenge_method") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const scope = url.searchParams.get("scope") ?? "read_only";

    if (responseType !== "code") {
      return json({ error: "unsupported_response_type" }, 400);
    }
    if (codeChallengeMethod !== "S256" || !codeChallenge) {
      return json({ error: "invalid_request", error_description: "PKCE S256 required" }, 400);
    }
    if (!ALLOWED_SCOPES.has(scope)) {
      return json(
        { error: "invalid_scope", error_description: "scope must be read_only or read_write" },
        400,
      );
    }
    const v = await validateClient(admin, clientId, redirectUri);
    if (!v.ok) return json({ error: v.error }, 400);

    // 302 to frontend consent page with params preserved.
    const consent = new URL(`${APP_URL}/oauth/consent`);
    consent.searchParams.set("client_id", clientId);
    consent.searchParams.set("redirect_uri", redirectUri);
    consent.searchParams.set("response_type", responseType);
    consent.searchParams.set("code_challenge", codeChallenge);
    consent.searchParams.set("code_challenge_method", codeChallengeMethod);
    consent.searchParams.set("state", state);
    consent.searchParams.set("scope", scope);
    return new Response(null, {
      status: 302,
      headers: { ...cors, Location: consent.toString() },
    });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // POST: consent page calls this with the user's JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return json({ error: "missing_authorization" }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "invalid_session" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const clientId = String(body?.client_id ?? "");
  const redirectUri = String(body?.redirect_uri ?? "");
  const codeChallenge = String(body?.code_challenge ?? "");
  const codeChallengeMethod = String(body?.code_challenge_method ?? "");
  const state = String(body?.state ?? "");
  const scope = String(body?.scope ?? "read_only");

  if (codeChallengeMethod !== "S256" || !codeChallenge) {
    return json({ error: "invalid_request", error_description: "PKCE S256 required" }, 400);
  }
  if (!ALLOWED_SCOPES.has(scope)) {
    return json(
      { error: "invalid_scope", error_description: "scope must be read_only or read_write" },
      400,
    );
  }
  const v = await validateClient(admin, clientId, redirectUri);
  if (!v.ok) return json({ error: v.error }, 400);

  const code = randomB64Url(32);
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString();

  const { error: insertErr } = await admin.from("oauth_auth_codes").insert({
    code_hash: codeHash,
    client_id: clientId,
    user_id: userData.user.id,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    redirect_uri: redirectUri,
    scope,
    expires_at: expiresAt,
  });
  if (insertErr) {
    console.error("[mcp-oauth-authorize] insert failed", insertErr);
    return json({ error: "server_error" }, 500);
  }

  const finalRedirect = new URL(redirectUri);
  finalRedirect.searchParams.set("code", code);
  if (state) finalRedirect.searchParams.set("state", state);
  return json({ redirect_to: finalRedirect.toString() }, 200);
});
