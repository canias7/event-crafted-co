// Opens the Stripe-hosted Customer Portal so a subscribed vendor can
// update their card, see invoices, cancel, or resume. Returns a
// time-limited URL the frontend redirects to.
//
// On every open, also:
//   - Programmatically attaches a Vendora-managed portal configuration
//     so subscription_update is guaranteed enabled (the default
//     dashboard config typically has plan-switching OFF).
//   - Reconciles profile.subscription_tier|monthly_grant|sub_id|
//     period_* against Stripe so the vendor's state catches up
//     even if the webhook missed an event (signing-secret rotation,
//     network blip, etc.). On an upgrade that wasn't yet reflected
//     in our DB, this also grants the new tier's full credit
//     allotment so the vendor sees the immediate uplift.
//
// Required env:
//   STRIPE_SECRET_KEY  — sk_test_... or sk_live_...
//   APP_URL            — base URL for the return_url

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Marker we stamp on portal configurations we create, so we can find
// + reuse the same config across invocations.
const CONFIG_MARKER_KEY = "vendora_managed";
// v2: dropped "quantity" from default_allowed_updates — subs are
// 1-per-user and the +/- quantity buttons are misleading.
const CONFIG_MARKER_VAL = "v2";

let cachedPortalConfigId: string | null = null;

async function getOrCreatePortalConfig(stripe: Stripe, db: any): Promise<string | null> {
  if (cachedPortalConfigId) return cachedPortalConfigId;

  const { data: pkgs } = await db
    .from("vendor_credit_packages")
    .select("stripe_price_id")
    .eq("kind", "subscription")
    .eq("active", true);
  const priceIds = ((pkgs ?? []) as Array<{ stripe_price_id: string | null }>)
    .map((p) => p.stripe_price_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (priceIds.length === 0) return null;

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

  const existing = await stripe.billingPortal.configurations.list({ limit: 100 });
  const match = existing.data.find(
    (c) => c.metadata?.[CONFIG_MARKER_KEY] === CONFIG_MARKER_VAL && c.active === true,
  );
  if (match) {
    cachedPortalConfigId = match.id;
    return match.id;
  }

  const created = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Manage your Vendora subscription" },
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

// Reconciles profile.subscription_tier|monthly_grant|sub_id|period_*
// against Stripe whenever the vendor opens the portal. Self-heals
// webhook drift so a vendor who upgraded/downgraded but didn't see
// the update can fix it themselves by re-opening Manage billing.
//
// On ANY tier change (up or down) where the vendor was already on
// a paid tier, grants the new tier's FULL monthly allotment.
// Matches how every other SaaS handles mid-cycle changes and
// matches what the pricing page promises ("Studio = 2,500 AI
// credits / month"). Idempotency key includes old+new tier so
// repeated portal opens never re-grant, but a vendor who flips
// Pro→Studio→Pro within one period gets a grant for each leg.
async function reconcileSubscriptionFromStripe(
  stripe: Stripe,
  db: any,
  userId: string,
  customerId: string,
): Promise<void> {
  try {
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    const sub = subs.data[0];
    if (!sub) return;
    const priceId = sub.items.data[0]?.price?.id;
    if (!priceId) return;
    const { data: pkg } = await db
      .from("vendor_credit_packages")
      .select("tier, credits, kind")
      .eq("stripe_price_id", priceId)
      .maybeSingle();
    if (!pkg || pkg.kind !== "subscription") return;
    const { data: oldProfile } = await db
      .from("profiles")
      .select("subscription_tier, monthly_grant")
      .eq("id", userId)
      .maybeSingle();
    const oldTier = oldProfile?.subscription_tier ?? null;
    const oldGrant = (oldProfile?.monthly_grant as number | null) ?? 0;
    await db.from("profiles").update({
      subscription_tier: pkg.tier,
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      subscription_cancel_at_period_end: sub.cancel_at_period_end ?? false,
      monthly_grant: pkg.credits,
      period_started_at: new Date(sub.current_period_start * 1000).toISOString(),
      period_ends_at: new Date(sub.current_period_end * 1000).toISOString(),
    }).eq("id", userId);
    // Tier-change grant: vendor moved between paid tiers (up or
    // down). Grant the new tier's full monthly allotment so the
    // balance reflects what they're now entitled to. Skip when:
    // - oldTier is null/free (covered by the normal initial-grant
    //   on checkout.session.completed)
    // - tier didn't actually change
    // Idempotency key includes old+new so a Pro→Studio→Pro flip
    // within one period gets a fresh grant for each leg.
    if (oldTier && oldTier !== "free" && pkg.tier && oldTier !== pkg.tier) {
      const reconcileKey = `reconcile_tier_change_${sub.id}_${sub.current_period_start}_${oldTier}_${pkg.tier}`;
      const { error } = await db.rpc("grant_credits", {
        p_user_id: userId,
        p_n: pkg.credits,
        p_kind: "monthly_grant",
        p_stripe_event_id: reconcileKey,
        p_stripe_invoice_id: null,
        p_note: `tier change reconcile: ${oldTier} → ${pkg.tier} (+${pkg.credits})`,
      });
      if (error && (error.code ?? "") !== "23505") {
        console.warn("[stripe-customer-portal] tier-change grant failed", error);
      }
    }
  } catch (err) {
    console.warn("[stripe-customer-portal] reconcile failed", err);
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Stripe/Supabase secrets not configured" }, 500);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing auth" }, 401);

  const userClient = createClient(SUPABASE_URL!, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return json({ error: "invalid auth" }, 401);

  const body = await req.json().catch(() => ({}));
  const vendorId = body?.vendor_id as string | undefined;
  const targetPriceId = body?.price_id as string | undefined;

  // Audit #5: vendor_id is OPTIONAL. A vendor with no listings yet
  // still needs to manage billing. JWT proves identity for their own
  // user-level Stripe customer.
  if (vendorId) {
    const { data: isAdmin } = await userClient.rpc("is_vendor_team_admin", { _vendor_id: vendorId });
    if (!isAdmin) return json({ error: "vendor admin role required" }, 403);
  }

  const db = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: profile } = await db.from("profiles").select("id, stripe_customer_id, stripe_subscription_id").eq("id", userId).maybeSingle();
  if (!profile?.stripe_customer_id) {
    return json({ error: "no stripe customer on this account" }, 400);
  }

  await reconcileSubscriptionFromStripe(stripe, db, userId, profile.stripe_customer_id as string);

  const { data: profile2 } = await db.from("profiles").select("id, stripe_customer_id, stripe_subscription_id").eq("id", userId).maybeSingle();
  const sub_id = profile2?.stripe_subscription_id ?? profile.stripe_subscription_id ?? null;

  const sessionArgs: Stripe.BillingPortal.SessionCreateParams = {
    customer: profile.stripe_customer_id as string,
    return_url: `${APP_URL}/vendor/subscription`,
  };

  const portalConfigId = await getOrCreatePortalConfig(stripe, db);
  if (portalConfigId) sessionArgs.configuration = portalConfigId;

  if (targetPriceId && sub_id) {
    try {
      const sub = await stripe.subscriptions.retrieve(sub_id);
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
    } catch (err) {
      console.warn("[stripe-customer-portal] subscription_update_confirm setup failed", err);
    }
  }

  let portal;
  try {
    portal = await stripe.billingPortal.sessions.create(sessionArgs);
  } catch (err) {
    if (sessionArgs.flow_data) {
      console.warn("[stripe-customer-portal] flow_data rejected, falling back to default portal", err);
      const { flow_data: _drop, ...fallback } = sessionArgs;
      portal = await stripe.billingPortal.sessions.create(fallback);
    } else {
      throw err;
    }
  }

  return json({ url: portal.url });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
