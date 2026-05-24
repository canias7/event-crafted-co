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
