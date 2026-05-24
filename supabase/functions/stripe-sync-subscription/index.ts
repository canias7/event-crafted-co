// Forces a state reconcile from Stripe to profiles for the calling
// vendor. Designed to be invoked the moment the user lands back on
// /vendor/subscription?upgraded=1 — without it, the page would
// re-query the DB which still holds the old tier until the webhook
// catches up (slow at best, broken when STRIPE_WEBHOOK_SECRET is
// mis-aligned).
//
// Auth: vendor JWT. Service-role DB writes happen server-side.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "secrets_not_configured" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "missing auth" });

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return json(401, { error: "invalid auth" });

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: profile } = await db
    .from("profiles")
    .select("id, stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.stripe_customer_id) {
    return json(404, { error: "no_stripe_customer" });
  }

  // Same shape as the reconcile in stripe-customer-portal. Pulls the
  // active sub from Stripe, writes tier/grant/period state to the
  // profile, and on a paid→paid tier change grants the new tier's
  // full monthly allotment (idempotent via stripe_event_id).
  try {
    const subs = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id as string,
      status: "active",
      limit: 1,
    });
    const sub = subs.data[0];
    if (!sub) return json(200, { synced: false, reason: "no_active_subscription" });

    const priceId = sub.items.data[0]?.price?.id;
    if (!priceId) return json(200, { synced: false, reason: "no_price_id" });

    const { data: pkg } = await db
      .from("vendor_credit_packages")
      .select("tier, credits, kind")
      .eq("stripe_price_id", priceId)
      .maybeSingle();
    if (!pkg || pkg.kind !== "subscription") {
      return json(200, { synced: false, reason: "package_not_found" });
    }

    const { data: oldProfile } = await db
      .from("profiles")
      .select("subscription_tier, monthly_grant")
      .eq("id", userId)
      .maybeSingle();
    const oldTier = oldProfile?.subscription_tier ?? null;

    await db.from("profiles").update({
      subscription_tier: pkg.tier,
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      stripe_customer_id: profile.stripe_customer_id,
      subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      subscription_cancel_at_period_end: sub.cancel_at_period_end ?? false,
      monthly_grant: pkg.credits,
      period_started_at: new Date(sub.current_period_start * 1000).toISOString(),
      period_ends_at: new Date(sub.current_period_end * 1000).toISOString(),
    }).eq("id", userId);

    let granted = 0;
    if (oldTier && oldTier !== "free" && pkg.tier && oldTier !== pkg.tier) {
      const reconcileKey = `reconcile_tier_change_${sub.id}_${sub.current_period_start}_${oldTier}_${pkg.tier}`;
      const { error: gerr } = await db.rpc("grant_credits", {
        p_user_id: userId,
        p_n: pkg.credits,
        p_kind: "monthly_grant",
        p_stripe_event_id: reconcileKey,
        p_stripe_invoice_id: null,
        p_note: `tier change reconcile: ${oldTier} → ${pkg.tier} (+${pkg.credits})`,
      });
      if (!gerr) granted = pkg.credits;
    }

    return json(200, {
      synced: true,
      tier: pkg.tier,
      old_tier: oldTier,
      monthly_grant: pkg.credits,
      granted_now: granted,
    });
  } catch (err) {
    console.error("[stripe-sync-subscription] failed", err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
