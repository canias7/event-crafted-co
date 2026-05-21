// OAuth discovery metadata. Serves two RFC documents:
//   - RFC 8414  (Authorization Server Metadata)
//   - RFC 9728  (Protected Resource Metadata)
//
// MCP clients land here when they hit the vendora-mcp endpoint and
// get back a 401 with WWW-Authenticate pointing at this URL. They
// fetch the AS metadata, discover register / authorize / token, and
// run the OAuth code flow with PKCE.
//
// Path routing: edge functions don't get sub-paths natively. We
// route off `kind` in the query string:
//   ?kind=as       -> Authorization Server Metadata
//   ?kind=resource -> Protected Resource Metadata
// Default (no param) returns AS metadata so callers hitting the
// raw function URL still get something useful.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PUBLIC_BASE = `${SUPABASE_URL}/functions/v1`;
const MCP_RESOURCE_URL = `${PUBLIC_BASE}/vendora-mcp`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "as";

  if (kind === "resource") {
    return json({
      resource: MCP_RESOURCE_URL,
      authorization_servers: [`${PUBLIC_BASE}/mcp-oauth-metadata?kind=as`],
      bearer_methods_supported: ["header"],
      scopes_supported: ["vendora"],
    });
  }

  // Authorization Server Metadata (default).
  return json({
    issuer: `${PUBLIC_BASE}/mcp-oauth-metadata?kind=as`,
    authorization_endpoint: `${PUBLIC_BASE}/mcp-oauth-authorize`,
    token_endpoint: `${PUBLIC_BASE}/mcp-oauth-token`,
    registration_endpoint: `${PUBLIC_BASE}/mcp-oauth-register`,
    grant_types_supported: ["authorization_code", "refresh_token"],
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "client_secret_post",
      "none",
    ],
    scopes_supported: ["vendora"],
  });
});

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
