// RevenueCat webhook — Apple In-App Purchase → profiles.subscription_tier.
//
// Why this exists: Apple rejected the vendor iOS app under guideline 3.1.1
// because subscriptions bought via Stripe unlock features in the app. On iOS
// the purchase therefore has to go through Apple In-App Purchase. RevenueCat
// wraps StoreKit on the client and calls this endpoint whenever a
// subscription starts, renews, changes, or lapses.
//
// This is the IAP mirror of stripe-sync-subscription: both funnel into the
// same profiles columns, so every existing entitlement gate (listing caps,
// gallery storage, credits) keeps reading one source of truth regardless of
// which store the vendor paid through.
//
// Mapping is data-driven: vendor_credit_packages.apple_product_id -> tier,
// mirroring how stripe_price_id -> tier works, so adding a plan needs no code
// change here.
//
// Auth: RevenueCat sends the shared secret configured in its dashboard as the
// Authorization header. We reject anything that doesn't match, because this
// endpoint grants paid entitlements.
//
// Required secrets:
//   REVENUECAT_WEBHOOK_SECRET  - the Authorization header value set in the
//                                RevenueCat dashboard webhook config
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const REVENUECAT_WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Event types that mean "this vendor currently has an entitlement".
// RENEWAL/UNCANCELLATION also land here so a resumed sub restores the tier.
const ACTIVE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "SUBSCRIPTION_EXTENDED",
]);

// Event types that mean the entitlement is gone right now. CANCELLATION is
// deliberately NOT here: Apple sends it when auto-renew is switched off, but
// the vendor keeps access until expiration, so we only flag cancel-at-period-end.
const INACTIVE_EVENTS = new Set(["EXPIRATION"]);

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!REVENUECAT_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "secrets_not_configured" });
  }

  // Shared-secret check. RevenueCat sends the value verbatim in Authorization.
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== REVENUECAT_WEBHOOK_SECRET) {
    return json(401, { error: "unauthorized" });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const event = payload?.event;
  const type: string = event?.type ?? "";
  if (!type) return json(400, { error: "missing_event_type" });

  // app_user_id is set to the Supabase auth user id when the client
  // configures the RevenueCat SDK (Purchases.logIn(user.id)), so it joins
  // straight to profiles.id.
  const userId: string | undefined = event?.app_user_id;
  if (!userId) return json(400, { error: "missing_app_user_id" });

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Events we don't act on (BILLING_ISSUE, TRANSFER, TEST, ...) are ack'd so
  // RevenueCat doesn't retry them forever.
  const isActive = ACTIVE_EVENTS.has(type);
  const isInactive = INACTIVE_EVENTS.has(type);
  if (!isActive && !isInactive && type !== "CANCELLATION") {
    return json(200, { handled: false, reason: `ignored_event_${type}` });
  }

  // Downgrade to free once the entitlement actually lapses.
  if (isInactive) {
    await db
      .from("profiles")
      .update({
        subscription_tier: "free",
        subscription_status: "canceled",
        subscription_cancel_at_period_end: false,
        monthly_grant: 0,
      })
      .eq("id", userId);
    return json(200, { handled: true, tier: "free" });
  }

  // Auto-renew turned off — keep the tier, just surface the pending cancel so
  // the UI can show "Cancels on <date>" exactly like the Stripe path does.
  if (type === "CANCELLATION") {
    await db
      .from("profiles")
      .update({ subscription_cancel_at_period_end: true })
      .eq("id", userId);
    return json(200, { handled: true, cancel_at_period_end: true });
  }

  const productId: string | undefined =
    event?.product_id ?? event?.new_product_id;
  if (!productId) return json(400, { error: "missing_product_id" });

  const { data: pkg } = await db
    .from("vendor_credit_packages")
    .select("tier, credits, kind")
    .eq("apple_product_id", productId)
    .maybeSingle();

  if (!pkg || pkg.kind !== "subscription" || !pkg.tier) {
    // Unknown product — ack so RevenueCat stops retrying, but report it so the
    // mismatch shows up in logs rather than silently granting nothing.
    return json(200, {
      handled: false,
      reason: "package_not_found",
      product_id: productId,
    });
  }

  const expiresMs: number | null = event?.expiration_at_ms ?? null;
  const periodEnd = expiresMs ? new Date(expiresMs).toISOString() : null;
  const purchasedMs: number | null = event?.purchased_at_ms ?? null;
  const periodStart = purchasedMs ? new Date(purchasedMs).toISOString() : null;

  const { data: oldProfile } = await db
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .maybeSingle();
  const oldTier = oldProfile?.subscription_tier ?? null;

  await db
    .from("profiles")
    .update({
      subscription_tier: pkg.tier,
      subscription_status: "active",
      subscription_cancel_at_period_end: false,
      subscription_current_period_end: periodEnd,
      monthly_grant: pkg.credits,
      period_started_at: periodStart,
      period_ends_at: periodEnd,
    })
    .eq("id", userId);

  // Grant the tier's credits on a real tier change or a fresh period, using
  // the same idempotent RPC the Stripe path uses. The key includes the
  // transaction id so RevenueCat retries and duplicate deliveries can't
  // double-credit (grant_credits is 23505-protected on the key).
  let granted = 0;
  const txId: string =
    event?.transaction_id ?? event?.id ?? `${productId}_${expiresMs ?? "na"}`;
  if (pkg.credits > 0 && (oldTier !== pkg.tier || type === "RENEWAL")) {
    const oldKey = oldTier ?? "free";
    // p_stripe_event_id is the generic idempotency key on grant_credits
    // (23505-protected), not Stripe-specific — namespaced here so an Apple
    // grant can never collide with a Stripe one.
    const grantKey = `revenuecat_${type}_${txId}_${oldKey}_${pkg.tier}`;
    const { error: gerr } = await db.rpc("grant_credits", {
      p_user_id: userId,
      p_n: pkg.credits,
      p_kind: "monthly_grant",
      p_stripe_event_id: grantKey,
      p_stripe_invoice_id: null,
      p_note: `apple iap ${type.toLowerCase()}: ${oldKey} → ${pkg.tier} (+${pkg.credits})`,
    });
    if (!gerr) granted = pkg.credits;
  }

  return json(200, {
    handled: true,
    tier: pkg.tier,
    granted,
  });
});
