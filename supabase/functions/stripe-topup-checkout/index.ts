// Starts a one-time Checkout flow for a credit top-up pack.
// Validates the requested price_id is a known top-up package
// (vendor_credit_packages.kind='topup'). On completion the
// stripe-webhook adds the credits to the vendor's balance.
//
// Required env: same set as stripe-subscription-checkout.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Stripe/Supabase secrets not configured" }, 500);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing auth" }, 401);

  const userClient = createClient(
    SUPABASE_URL!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  const userEmail = userData?.user?.email;
  if (!userId) return json({ error: "invalid auth" }, 401);

  const body = await req.json().catch(() => ({}));
  const vendorId = body?.vendor_id as string | undefined;
  const priceId = body?.price_id as string | undefined;
  if (!vendorId) return json({ error: "vendor_id required" }, 400);
  if (!priceId) return json({ error: "price_id required" }, 400);

  // Top-ups are admin-only too — they cost real money.
  const { data: isAdmin } = await userClient.rpc("is_vendor_team_admin", {
    _vendor_id: vendorId,
  });
  if (!isAdmin) return json({ error: "vendor admin role required" }, 403);

  const db = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Validate this is a known top-up package.
  const { data: pkg } = await db
    .from("vendor_credit_packages")
    .select("kind, credits, display_name, unit_amount_cents")
    .eq("stripe_price_id", priceId)
    .eq("active", true)
    .maybeSingle();
  if (!pkg || (pkg as any).kind !== "topup") {
    return json({ error: "invalid_topup_price" }, 400);
  }

  const { data: vendor } = await db
    .from("vendor_profiles")
    .select("id, business_name, stripe_customer_id")
    .eq("id", vendorId)
    .maybeSingle();
  if (!vendor) return json({ error: "vendor not found" }, 404);

  // Top-ups need a Stripe Customer too — webhook resolves the vendor
  // from the customer id when granting credits.
  let customerId = vendor.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail ?? undefined,
      name: vendor.business_name ?? undefined,
      metadata: { vendor_id: vendorId },
    });
    customerId = customer.id;
    await db
      .from("vendor_profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", vendorId);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_intent_data: { metadata: { vendor_id: vendorId, kind: "credit_topup" } },
    metadata: { vendor_id: vendorId, kind: "credit_topup" },
    allow_promotion_codes: true,
    success_url: `${APP_URL}/vendor/subscription?topup=1`,
    cancel_url: `${APP_URL}/vendor/subscription?topup_cancelled=1`,
  });

  return json({ url: session.url, session_id: session.id });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
