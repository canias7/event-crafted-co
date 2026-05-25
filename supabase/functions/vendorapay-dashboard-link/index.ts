// VendoraPay: POST /vendorapay-dashboard-link { business_id }
//
// Creates a one-time Stripe Express login link the vendor opens to
// manage their connected account — add/swap bank, update identity
// info, view payout history at the processor level. URL is valid
// for ~5 minutes, single-use.
//
// Admin-only. Returns { url } the frontend opens in a new tab.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

let _client: Stripe | null = null;
function client(): Stripe {
  if (!_client) {
    if (!STRIPE_SECRET_KEY) throw new Error("VendoraPay not configured");
    _client = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
  }
  return _client;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "unauthorized" });

    const body = await req.json().catch(() => ({}));
    const businessId = body?.business_id as string | undefined;
    if (!businessId) return json(400, { error: "business_id required" });

    const { data: isAdmin } = await userClient.rpc("is_vendor_team_admin", { _vendor_id: businessId });
    if (!isAdmin) return json(403, { error: "admin role required" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: secret } = await admin
      .from("vendor_payment_secrets")
      .select("stripe_account_id")
      .eq("vendor_id", businessId)
      .maybeSingle();
    const accountId = (secret as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? null;
    if (!accountId) return json(400, { error: "vendor not onboarded" });

    const link = await client().accounts.createLoginLink(accountId);
    return json(200, { url: link.url });
  } catch (err) {
    console.error("[vendorapay-dashboard-link] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: "link_failed", detail: message.slice(0, 240) });
  }
});
