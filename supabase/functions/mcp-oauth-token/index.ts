// OAuth 2.1 token endpoint.
//
// Two grants:
//   - authorization_code: exchange a code + PKCE verifier for
//     access + refresh tokens.
//   - refresh_token: rotate an access token using a refresh token.
//
// Tokens are opaque random bytes; we store SHA-256 hashes only.
// Access tokens live 1h; refresh tokens 30 days, rotated on every
// refresh.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ACCESS_TTL_SEC = 3600;
const REFRESH_TTL_SEC = 30 * 86400;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

async function sha256B64Url(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
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

// Constant-time equality for two equal-length hex strings. Both
// sides are SHA-256 digests (64 hex chars) so plain `===` would
// have an early-exit timing characteristic; this loops the full
// length regardless of whether bytes match.
function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function parseForm(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("Content-Type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const out: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(text)) out[k] = v;
    return out;
  }
  if (ct.includes("application/json")) {
    try {
      const body = await req.json();
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(body ?? {})) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    } catch {
      return {};
    }
  }
  return {};
}

async function verifyClientAuth(
  admin: any,
  form: Record<string, string>,
  req: Request,
): Promise<{ ok: true; clientId: string } | { ok: false; error: string }> {
  let clientId = form.client_id ?? "";
  let clientSecret = form.client_secret ?? "";
  // Basic auth fallback.
  if (!clientSecret) {
    const auth = req.headers.get("Authorization") ?? "";
    if (auth.startsWith("Basic ")) {
      try {
        const decoded = atob(auth.slice(6));
        const idx = decoded.indexOf(":");
        if (idx >= 0) {
          clientId = decoded.slice(0, idx);
          clientSecret = decoded.slice(idx + 1);
        }
      } catch {
        // fall through
      }
    }
  }
  if (!clientId) return { ok: false, error: "invalid_client" };
  const { data: client } = await admin
    .from("oauth_clients")
    .select("client_id, client_secret_hash")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!client) return { ok: false, error: "invalid_client" };
  const storedHash = (client as { client_secret_hash: string | null })
    .client_secret_hash;
  // Confidential clients (those registered with a secret) MUST present
  // it. Skipping this lets a stolen auth code + PKCE verifier be
  // redeemed without proving client identity.
  if (storedHash) {
    if (!clientSecret) return { ok: false, error: "invalid_client" };
    const hash = await sha256Hex(clientSecret);
    if (!constantTimeHexEqual(hash, storedHash)) {
      return { ok: false, error: "invalid_client" };
    }
  }
  return { ok: true, clientId };
}

async function issueTokens(
  admin: any,
  clientId: string,
  userId: string,
  scope: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}> {
  const accessToken = `vat_${randomB64Url(32)}`;
  const refreshToken = `vrt_${randomB64Url(32)}`;
  const accessHash = await sha256Hex(accessToken);
  const refreshHash = await sha256Hex(refreshToken);
  const now = Date.now();
  await admin.from("oauth_access_tokens").insert({
    token_hash: accessHash,
    refresh_token_hash: refreshHash,
    client_id: clientId,
    user_id: userId,
    scope,
    expires_at: new Date(now + ACCESS_TTL_SEC * 1000).toISOString(),
    refresh_expires_at: new Date(now + REFRESH_TTL_SEC * 1000).toISOString(),
  });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SEC,
    scope,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const form = await parseForm(req);

  const grantType = form.grant_type;
  if (!grantType) return json({ error: "invalid_request" }, 400);

  const auth = await verifyClientAuth(admin, form, req);
  if (!auth.ok) return json({ error: auth.error }, 401);
  const clientId = auth.clientId;

  if (grantType === "authorization_code") {
    const code = form.code ?? "";
    const redirectUri = form.redirect_uri ?? "";
    const codeVerifier = form.code_verifier ?? "";
    if (!code || !redirectUri || !codeVerifier) {
      return json({ error: "invalid_request" }, 400);
    }
    const codeHash = await sha256Hex(code);
    const { data: codeRow } = await admin
      .from("oauth_auth_codes")
      .select(
        "code_hash, client_id, user_id, code_challenge, code_challenge_method, redirect_uri, scope, expires_at, consumed_at",
      )
      .eq("code_hash", codeHash)
      .maybeSingle();
    if (!codeRow) return json({ error: "invalid_grant" }, 400);
    const c = codeRow as any;
    if (c.consumed_at) return json({ error: "invalid_grant", error_description: "code already used" }, 400);
    if (new Date(c.expires_at).getTime() < Date.now()) return json({ error: "invalid_grant", error_description: "code expired" }, 400);
    if (c.client_id !== clientId) return json({ error: "invalid_grant" }, 400);
    if (c.redirect_uri !== redirectUri) return json({ error: "invalid_grant" }, 400);

    // PKCE verify: SHA256(verifier) base64url == stored challenge.
    const challengeComputed = await sha256B64Url(codeVerifier);
    if (challengeComputed !== c.code_challenge) {
      return json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
    }

    // Mark code consumed BEFORE issuing tokens to dodge replay.
    const { error: consumeErr } = await admin
      .from("oauth_auth_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("code_hash", codeHash)
      .is("consumed_at", null);
    if (consumeErr) {
      return json({ error: "invalid_grant", error_description: "code already used" }, 400);
    }

    const tokens = await issueTokens(admin, clientId, c.user_id, c.scope);
    return json(tokens, 200);
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.refresh_token ?? "";
    if (!refreshToken) return json({ error: "invalid_request" }, 400);
    const refreshHash = await sha256Hex(refreshToken);
    const { data: row } = await admin
      .from("oauth_access_tokens")
      .select("id, client_id, user_id, scope, refresh_expires_at, revoked_at")
      .eq("refresh_token_hash", refreshHash)
      .maybeSingle();
    if (!row) return json({ error: "invalid_grant" }, 400);
    const r = row as any;
    if (r.revoked_at) return json({ error: "invalid_grant" }, 400);
    if (r.client_id !== clientId) return json({ error: "invalid_grant" }, 400);
    if (new Date(r.refresh_expires_at).getTime() < Date.now()) {
      return json({ error: "invalid_grant", error_description: "refresh token expired" }, 400);
    }

    // Rotate: revoke the old row, issue a new one. Refresh-token
    // rotation prevents replay if the old token leaks.
    await admin
      .from("oauth_access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", r.id);
    const tokens = await issueTokens(admin, clientId, r.user_id, r.scope);
    return json(tokens, 200);
  }

  return json({ error: "unsupported_grant_type" }, 400);
});
