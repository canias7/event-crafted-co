// Stripe MCP connect endpoint — vendor pastes a Stripe Restricted
// API key, we validate it with Stripe, then persist it on
// profiles.stripe_mcp_api_key (column-level REVOKE keeps the value
// out of every client-side path).
//
// my-space-chat reads the stored key via service_role and forwards
// it to Anthropic's Messages API as the bearer token on the
// mcp_servers entry pointing at https://mcp.stripe.com/.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  try {
    // Gate on signed-in user via the caller's access token.
    const authHeader = req.headers.get("Authorization") ?? "";
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData } = await client.auth.getUser();
    if (!userData?.user) return json(401, { error: "unauthorized" });
    const userId = userData.user.id;

    const payload = await req.json().catch(() => ({}));
    const apiKey = String(payload?.api_key ?? "").trim();
    if (!apiKey) return json(400, { error: "missing_api_key" });

    // Stripe restricted keys live in two namespaces (rk_test_* and
    // rk_live_*). Live secret keys (sk_*) also work with the API but
    // they grant full access — we reject those at the door so a
    // vendor doesn't accidentally paste a god key into the chatbox
    // surface.
    if (!/^rk_(test|live)_/.test(apiKey)) {
      return json(400, {
        error: "wrong_key_type",
        detail:
          "Paste a Restricted API key (starts with rk_test_ or rk_live_). Don't paste a Secret key.",
      });
    }

    // Validate the key by calling Stripe — /v1/balance is read-only
    // and works for any restricted key with read scope on balance,
    // which any vaguely useful AI scope will include.
    const validate = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!validate.ok) {
      const detail = await validate.text();
      return json(400, {
        error: "stripe_rejected",
        detail: detail.slice(0, 240),
      });
    }

    // Persist via service_role — REVOKE blocks the caller from
    // writing this column with their own JWT, and we want the write
    // to be auditable to "this user via vendor-stripe-mcp-connect."
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const last4 = apiKey.slice(-4);
    const { error } = await admin
      .from("profiles")
      .update({
        stripe_mcp_api_key: apiKey,
        stripe_mcp_key_last4: last4,
        stripe_mcp_connected_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) {
      console.error("[vendor-stripe-mcp-connect] store failed", error);
      return json(500, { error: "store_failed", detail: error.message });
    }

    return json(200, {
      connected: true,
      last4,
      connected_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[vendor-stripe-mcp-connect] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, {
      error: "connect_failed",
      detail: message.slice(0, 240),
    });
  }
});
