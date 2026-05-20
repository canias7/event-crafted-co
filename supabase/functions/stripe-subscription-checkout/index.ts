// Starts a subscription Checkout flow for a vendor upgrading to Pro.
// Creates (or reuses) a Stripe Customer keyed on stripe_customer_id,
// then mints a Checkout Session in mode='subscription' with the Pro
// price. On completion, the webhook flips subscription_tier='pro'.
//
// Required env:
//   STRIPE_SECRET_KEY     — sk_test_... or sk_live_...
//   STRIPE_PRO_PRICE_ID   — price_... for the Vendora Pro monthly plan
//   APP_URL               — base URL of the web app
//
// Invoke from frontend:
//   const { data } = await supabase.functions.invoke(
//     "stripe-subscription-checkout",
//     { body: { vendor_id } },
//   );
//   window.location.href = data.url;

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_PRO_PRICE_ID = Deno.env.get("STRIPE_PRO_PRICE_ID");
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
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }
  if (
    !STRIPE_SECRET_KEY ||
    !STRIPE_PRO_PRICE_ID ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
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
  if (!vendorId) return json({ error: "vendor_id required" }, 400);

  // Admin-only — billing changes (upgrading, attaching a card) are
  // financial decisions on the org's behalf. Team members shouldn't
  // be able to upgrade the platform's plan.
  const { data: isAdmin } = await userClient.rpc("is_vendor_team_admin", {
    _vendor_id: vendorId,
  });
  if (!isAdmin) return json({ error: "vendor admin role required" }, 403);

  const db = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: vendor } = await db
    .from("vendor_profiles")
    .select(
      "id, business_name, stripe_customer_id, subscription_tier, subscription_status",
    )
    .eq("id", vendorId)
    .maybeSingle();
  if (!vendor) return json({ error: "vendor not found" }, 404);

  // Block double-checkout when an active subscription already exists.
  // Stripe would happily let us create a second sub, but the webhook
  // would overwrite the first — and the vendor would be billed twice
  // until the orphaned one fails to renew.
  if (
    vendor.subscription_tier === "pro" &&
    vendor.subscription_status &&
    ["active", "trialing"].includes(vendor.subscription_status as string)
  ) {
    return json({ error: "already subscribed — use the portal to manage" }, 400);
  }

  // Create a Stripe Customer the first time a vendor pays. Store
  // metadata.vendor_id so webhook handlers can reverse-lookup even
  // if stripe_customer_id was lost. Email pre-fill is best-effort.
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
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: STRIPE_PRO_PRICE_ID, quantity: 1 }],
    // Surface vendor_id on both the session AND the subscription
    // it creates — gives the webhook two reverse-lookup paths
    // (subscription metadata + customer metadata above).
    subscription_data: { metadata: { vendor_id: vendorId } },
    metadata: { vendor_id: vendorId },
    // Stripe will pre-fill the email field from the Customer record.
    allow_promotion_codes: true,
    success_url: `${APP_URL}/vendor/subscription?upgraded=1`,
    cancel_url: `${APP_URL}/vendor/subscription?cancelled=1`,
  });

  return json({ url: session.url, session_id: session.id });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
