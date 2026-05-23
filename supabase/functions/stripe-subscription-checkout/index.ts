// Starts a subscription Checkout flow for a vendor.
//
// Accepts a `price_id` from the request body. Validates it against
// vendor_credit_packages (kind='subscription') so a caller can't
// hit Stripe with an arbitrary price. Falls back to
// STRIPE_PRO_PRICE_ID for legacy callers that don't send price_id
// (existing button on the old subscription page).
//
// Required env:
//   STRIPE_SECRET_KEY     — sk_test_... or sk_live_...
//   STRIPE_PRO_PRICE_ID   — fallback price_... (back-compat only)
//   APP_URL               — base URL of the web app
//
// Invoke from frontend:
//   const { data } = await supabase.functions.invoke(
//     "stripe-subscription-checkout",
//     { body: { vendor_id, price_id } },
//   );

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
  const requestedPriceId = (body?.price_id as string | undefined) ?? STRIPE_PRO_PRICE_ID;
  if (!vendorId) return json({ error: "vendor_id required" }, 400);
  if (!requestedPriceId) return json({ error: "price_id required (and STRIPE_PRO_PRICE_ID fallback unset)" }, 400);

  // Admin-only — billing changes (upgrading, attaching a card) are
  // financial decisions on the org's behalf.
  const { data: isAdmin } = await userClient.rpc("is_vendor_team_admin", {
    _vendor_id: vendorId,
  });
  if (!isAdmin) return json({ error: "vendor admin role required" }, 403);

  const db = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Validate the price is a known subscription package. Without
  // this anyone with checkout access could pass a top-up price ID
  // (one-time) to a subscription-mode session, or an arbitrary
  // Stripe price ID we don't expect.
  const { data: pkg } = await db
    .from("vendor_credit_packages")
    .select("kind, tier, display_name")
    .eq("stripe_price_id", requestedPriceId)
    .eq("active", true)
    .maybeSingle();
  if (!pkg || (pkg as any).kind !== "subscription") {
    return json({ error: "invalid_subscription_price" }, 400);
  }

  // Subscription state lives on profiles (per-user) now. We still
  // pull the listing's business_name from vendor_profiles for the
  // Stripe Customer display name (whichever listing the vendor
  // launched checkout from).
  const [{ data: profile }, { data: listing }] = await Promise.all([
    db
      .from("profiles")
      .select(
        "id, stripe_customer_id, subscription_tier, subscription_status",
      )
      .eq("id", userId)
      .maybeSingle(),
    db
      .from("vendor_profiles")
      .select("id, business_name")
      .eq("id", vendorId)
      .maybeSingle(),
  ]);
  if (!profile) return json({ error: "profile not found" }, 404);
  if (!listing) return json({ error: "vendor not found" }, 404);

  // Block double-checkout when an active subscription already exists.
  // For tier changes (upgrade/downgrade) the vendor uses the portal,
  // not a fresh Checkout.
  const liveTiers = ["starter", "pro", "studio"];
  if (
    liveTiers.includes(profile.subscription_tier as string) &&
    profile.subscription_status &&
    ["active", "trialing"].includes(profile.subscription_status as string)
  ) {
    return json({ error: "already subscribed — use the portal to change plan" }, 400);
  }

  let customerId = profile.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail ?? undefined,
      name: listing.business_name ?? undefined,
      metadata: { user_id: userId, vendor_id: vendorId },
    });
    customerId = customer.id;
    await db
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", userId);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: requestedPriceId, quantity: 1 }],
    subscription_data: { metadata: { user_id: userId, vendor_id: vendorId } },
    metadata: { user_id: userId, vendor_id: vendorId },
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
