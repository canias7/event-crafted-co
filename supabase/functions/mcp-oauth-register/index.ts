// Dynamic Client Registration (RFC 7591). Claude clients POST a
// minimal payload here and get back a freshly minted client_id +
// client_secret. We accept everything by default since the actual
// permissions enforcement happens at /authorize (the user has to
// approve) and /token (PKCE).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Redirect URIs are user-controlled. Without validation, a client
// could register `javascript:`/`data:` URIs that we'd later redirect
// the browser to — XSS-equivalent. Limit to https:// plus loopback
// http:// for local development (RFC 8252 §7.3).
function isAllowedRedirectUri(s: string): boolean {
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]")
  ) {
    return true;
  }
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "Body is not JSON" }, 400);
  }

  const redirectUris = Array.isArray(body?.redirect_uris)
    ? (body.redirect_uris as unknown[]).filter((u) => typeof u === "string")
    : [];
  if (redirectUris.length === 0) {
    return json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris required" },
      400,
    );
  }
  for (const u of redirectUris) {
    if (!isAllowedRedirectUri(u as string)) {
      return json(
        {
          error: "invalid_redirect_uri",
          error_description:
            "redirect_uris must be https:// (or http://localhost for development); no javascript:, data:, or fragment URIs",
        },
        400,
      );
    }
  }
  const clientName =
    typeof body?.client_name === "string" ? body.client_name.slice(0, 200) : null;

  const clientId = `vendora_${randomB64Url(16)}`;
  const clientSecret = `vsk_${randomB64Url(32)}`;
  const clientSecretHash = await sha256Hex(clientSecret);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.from("oauth_clients").insert({
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    client_name: clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "client_secret_post",
  });
  if (error) {
    console.error("[mcp-oauth-register] insert failed", error);
    return json({ error: "server_error" }, 500);
  }

  return json(
    {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "client_secret_post",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: clientName,
    },
    201,
  );
});
