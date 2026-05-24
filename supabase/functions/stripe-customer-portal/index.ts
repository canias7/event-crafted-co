// Opens the Stripe-hosted Customer Portal so a subscribed vendor can
// update their card, see invoices, cancel, or resume. Returns a
// time-limited URL the frontend redirects to.
//
// Required env:
//   STRIPE_SECRET_KEY  — sk_test_... or sk_live_...
//   APP_URL            — base URL for the return_url
//
// Invoke from frontend:
//   const { data } = await supabase.functions.invoke(
//     "stripe-customer-portal", { body: { vendor_id } },
//   );
//   window.location.href = data.url;

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Marker we stamp on portal configurations we create, so we can find
// + reuse the same config across invocations instead of cluttering
// the Stripe Dashboard with one config per portal open.
const CONFIG_MARKER_KEY = "vendora_managed";
// v2: drop "quantity" from default_allowed_updates — vendors should
// only see plan-switching, not a +/- quantity control (subscriptions
// are 1-per-user; bumping quantity would just double-bill).
const CONFIG_MARKER_VAL = "v2";

// Warm-cache the configuration id across invocations of the same
// Deno isolate. Cold starts hit Stripe to list/create.
let cachedPortalConfigId: string | null = null;

// Builds (or finds) a Stripe Billing Portal configuration that has
// subscription_update enabled, with our 3 tier prices in the
// allowlist. Without this, the default portal config typically has
// subscription_update DISABLED, so passing flow_data.subscription_
// update_confirm gets silently rejected and the vendor lands on
// portal home — exactly the bug PR #802 fixed half of.
async function getOrCreatePortalConfig(
  stripe: Stripe,
  db: any, // deno-lint-ignore no-explicit-any
): Promise<string | null> {
  if (cachedPortalConfigId) return cachedPortalConfigId;

  // Pull subscription prices from our catalog so the function stays
  // in sync with whatever's live (no hardcoded price IDs to drift).
  const { data: pkgs } = await db
    .from("vendor_credit_packages")
    .select("stripe_price_id")
    .eq("kind", "subscription")
    .eq("active", true);
  const priceIds = ((pkgs ?? []) as Array<{ stripe_price_id: string | null }>)
    .map((p) => p.stripe_price_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (priceIds.length === 0) return null;

  // Each portal product config needs the product id + the prices it
  // exposes. Resolve product id from each price.
  const prices = await Promise.all(priceIds.map((id) => stripe.prices.retrieve(id)));
  const productMap = new Map<string, string[]>();
  for (const pr of prices) {
    const prodId = typeof pr.product === "string" ? pr.product : pr.product.id;
    const list = productMap.get(prodId) ?? [];
    list.push(pr.id);
    productMap.set(prodId, list);
  }
  const portalProducts = Array.from(productMap.entries()).map(
    ([product, pricesArr]) => ({ product, prices: pricesArr }),
  );

  // Reuse the existing config (by metadata marker) if we already
  // made one — avoids cluttering Stripe with a new config per cold
  // start.
  const existing = await stripe.billingPortal.configurations.list({ limit: 100 });
  const match = existing.data.find(
    (c) => c.metadata?.[CONFIG_MARKER_KEY] === CONFIG_MARKER_VAL && c.active === true,
  );
  if (match) {
    cachedPortalConfigId = match.id;
    return match.id;
  }

  const created = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: "Manage your Vendora subscription",
    },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "address", "name", "tax_id"],
      },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true,
        // No "quantity" — Vendora is 1 sub per user.
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: portalProducts,
      },
    },
    metadata: { [CONFIG_MARKER_KEY]: CONFIG_MARKER_VAL },
  });
  cachedPortalConfigId = created.id;
  return created.id;
}

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
  if (!userId) return json({ error: "invalid auth" }, 401);

  const body = await req.json().catch(() => ({}));
  const vendorId = body?.vendor_id as string | undefined;
  // Optional. When present, deep-link the portal to the
  // subscription_update_confirm flow with this price pre-selected
  // — so clicking "Switch to Pro" on the page lands the vendor
  // straight on the "confirm Pro" step instead of the portal home
  // (which leads with Cancel and hides the plan-change UI).
  const targetPriceId = body?.price_id as string | undefined;
  if (!vendorId) return json({ error: "vendor_id required" }, 400);

  const { data: isAdmin } = await userClient.rpc("is_vendor_team_admin", {
    _vendor_id: vendorId,
  });
  if (!isAdmin) return json({ error: "vendor admin role required" }, 403);

  const db = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  // Stripe customer + subscription live on profiles per-user. vendor_id
  // is still the admin-check key (so a team admin on listing X can
  // open billing for the owning user's Stripe Customer).
  const { data: profile } = await db
    .from("profiles")
    .select("id, stripe_customer_id, stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.stripe_customer_id) {
    return json({ error: "no stripe customer on this account" }, 400);
  }

  // Self-heal: profile has a customer id but no subscription id
  // (a sub created before the state-to-profiles migration backfill,
  // or any drift since). Look up the active sub from Stripe and
  // write it back — without this, the deep-link branch below would
  // silently skip and the vendor lands on portal home.
  if (!profile.stripe_subscription_id) {
    try {
      const subs = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id as string,
        status: "active",
        limit: 1,
      });
      const found = subs.data[0]?.id ?? null;
      if (found) {
        profile.stripe_subscription_id = found;
        await db
          .from("profiles")
          .update({ stripe_subscription_id: found })
          .eq("id", userId);
      }
    } catch (err) {
      // Don't fail the portal open on a Stripe list hiccup — fall
      // through to the no-deep-link path.
      console.warn(
        "[stripe-customer-portal] subscription self-heal lookup failed",
        err,
      );
    }
  }

  // Default portal session (no deep link).
  const sessionArgs: Stripe.BillingPortal.SessionCreateParams = {
    customer: profile.stripe_customer_id as string,
    return_url: `${APP_URL}/vendor/subscription`,
  };

  // Attach our managed portal configuration so subscription_update
  // is guaranteed enabled. Without this, Stripe falls back to the
  // dashboard "default" config, which typically has plan switching
  // off → flow_data.subscription_update_confirm gets rejected → the
  // vendor lands on portal home instead of the plan-confirm screen.
  const portalConfigId = await getOrCreatePortalConfig(stripe, db);
  if (portalConfigId) {
    sessionArgs.configuration = portalConfigId;
  }

  // Deep link into the plan-change confirm screen when the caller
  // passed a target price. Needs the subscription id + the
  // subscription's first item id (Stripe's subscription_update_confirm
  // requires both — there's no shorthand for "swap the only item").
  if (targetPriceId && profile.stripe_subscription_id) {
    try {
      const sub = await stripe.subscriptions.retrieve(
        profile.stripe_subscription_id as string,
      );
      const item = sub.items.data[0];
      if (item && item.price?.id !== targetPriceId) {
        sessionArgs.flow_data = {
          type: "subscription_update_confirm",
          subscription_update_confirm: {
            subscription: sub.id,
            items: [{ id: item.id, price: targetPriceId, quantity: 1 }],
          },
          after_completion: {
            type: "redirect",
            redirect: { return_url: `${APP_URL}/vendor/subscription?upgraded=1` },
          },
        };
      }
      // If item.price.id === targetPriceId the user is asking to
      // "switch" to the tier they're already on — fall through to the
      // default portal so they see context instead of a no-op confirm.
    } catch (err) {
      // Don't fail the open — fall back to default portal if Stripe
      // hiccups on the subscription retrieve.
      console.warn("[stripe-customer-portal] subscription_update_confirm setup failed", err);
    }
  }

  // Audit H2: when the portal config doesn't have "Customers can
  // switch plans" enabled (or the target product isn't registered),
  // Stripe rejects flow_data and the create throws. Retry without
  // the deep link so the vendor at least lands on the portal home
  // instead of getting stuck on a 500.
  let portal;
  try {
    portal = await stripe.billingPortal.sessions.create(sessionArgs);
  } catch (err) {
    if (sessionArgs.flow_data) {
      console.warn(
        "[stripe-customer-portal] flow_data rejected, falling back to default portal",
        err,
      );
      const { flow_data: _drop, ...fallback } = sessionArgs;
      portal = await stripe.billingPortal.sessions.create(fallback);
    } else {
      throw err;
    }
  }

  return json({ url: portal.url });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
