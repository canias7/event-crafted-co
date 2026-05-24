// Changes an existing vendor's subscription to a new tier with
// "reset clock + charge today" semantics:
//
//   1. Old tier money already paid stays paid (no proration refund —
//      vendor keeps the unused-Studio portion as revenue).
//   2. New tier's full monthly amount is charged immediately.
//   3. Billing cycle resets to today; next charge happens 30 days
//      from now and every month after.
//   4. New tier's full monthly credit grant is added on top of the
//      vendor's existing balance (they keep what they paid for).
//
// Why this lives outside the Stripe customer portal: the portal can
// only set proration_behavior on tier swaps, it can't reset the
// billing_cycle_anchor. We need both proration_behavior: 'none' AND
// billing_cycle_anchor: 'now' so the new tier bills today, not at
// the leftover old-cycle renewal date.
//
// Required env:
//   STRIPE_SECRET_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_ANON_KEY (for auth.getUser via user JWT)
//
// Invoke from frontend:
//   const { data } = await supabase.functions.invoke(
//     "stripe-change-tier",
//     { body: { price_id: "price_..." } },
//   );

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "secrets_not_configured" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "missing_auth" });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return json(401, { error: "invalid_auth" });

  const body = await req.json().catch(() => ({}));
  const newPriceId = body?.price_id as string | undefined;
  if (!newPriceId) return json(400, { error: "price_id_required" });

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Validate the target price is a known subscription tier. Without
  // this anyone with the endpoint could pass a top-up price or an
  // arbitrary Stripe price ID and we'd let Stripe try it.
  const { data: newPkg } = await db
    .from("vendor_credit_packages")
    .select("kind, tier, credits, display_name, unit_amount_cents")
    .eq("stripe_price_id", newPriceId)
    .eq("active", true)
    .maybeSingle();
  if (!newPkg || (newPkg as any).kind !== "subscription" || !(newPkg as any).tier) {
    return json(400, { error: "invalid_subscription_price" });
  }

  const { data: profile } = await db
    .from("profiles")
    .select("id, stripe_customer_id, stripe_subscription_id, subscription_tier")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.stripe_customer_id) {
    return json(400, {
      error: "no_stripe_customer",
      message: "Subscribe through checkout first, then change tiers here.",
    });
  }

  // Pull the active subscription from Stripe (don't trust the cached
  // subscription_id in profiles — it may be stale if the previous
  // sub was cancelled out-of-band).
  const subs = await stripe.subscriptions.list({
    customer: profile.stripe_customer_id as string,
    status: "active",
    limit: 1,
  });
  const sub = subs.data[0];
  if (!sub) {
    return json(400, {
      error: "no_active_subscription",
      message: "Subscribe through checkout first, then change tiers here.",
    });
  }

  const currentPriceId = sub.items.data[0]?.price?.id;
  const subItemId = sub.items.data[0]?.id;
  if (!currentPriceId || !subItemId) {
    return json(500, { error: "subscription_has_no_items" });
  }
  if (currentPriceId === newPriceId) {
    return json(200, { changed: false, reason: "already_on_this_tier" });
  }

  const oldTier = profile.subscription_tier ?? "free";

  // Update the subscription in-place:
  //   - swap to the new price
  //   - proration_behavior: 'none' so Stripe doesn't refund the
  //     unused old-tier portion (the vendor keeps that revenue)
  //   - billing_cycle_anchor: 'now' resets the cycle to today so
  //     the NEXT auto-renewal is 30 days from today, then monthly.
  //     Important: anchor reset by itself does NOT trigger an
  //     immediate invoice — Stripe only auto-bills at the END of
  //     each period. We invoice manually below to make the charge
  //     happen today.
  let updated;
  try {
    updated = await stripe.subscriptions.update(sub.id, {
      items: [{ id: subItemId, price: newPriceId }],
      proration_behavior: "none",
      billing_cycle_anchor: "now",
      payment_behavior: "error_if_incomplete",
    });
  } catch (err: any) {
    console.error("[stripe-change-tier] subscription.update failed", err);
    return json(400, {
      error: "stripe_update_failed",
      message: err?.message ?? "Stripe rejected the tier change.",
    });
  }

  // Manually create an invoice for the new tier's full monthly
  // amount and pay it today. We bypass the subscription's normal
  // billing cycle (which would fire 30 days from now) and bill the
  // first month up-front, as the vendor explicitly opted in to via
  // the confirmation alert.
  //
  // Why the multi-step dance: stripe.invoices.create + auto_advance:
  // true *finalizes* the invoice synchronously, but the payment
  // attempt is enqueued async. By the time we retrieved the invoice
  // we'd see amount_paid: 0 even though Stripe was about to charge
  // the card. Switching to explicit finalizeInvoice → pay returns
  // the actual payment result before we respond to the client.
  //
  // Payment-method resolution: ad-hoc invoices fall back to the
  // customer's invoice_settings.default_payment_method, which is
  // null for customers who only paid via Checkout (Checkout puts
  // the PM on the SUBSCRIPTION's default_payment_method instead).
  // Resolve in order: sub.default_payment_method →
  // customer.invoice_settings.default_payment_method → fail with
  // no_payment_method_on_file so the front end can prompt for a
  // card update via the portal.
  const unitAmountCents = (newPkg as any).unit_amount_cents as number;
  const displayName = (newPkg as any).display_name as string;
  let chargedNow = 0;
  let chargeFailed: string | null = null;

  let paymentMethodId: string | null = null;
  if (updated.default_payment_method) {
    paymentMethodId = typeof updated.default_payment_method === "string"
      ? updated.default_payment_method
      : (updated.default_payment_method as { id: string }).id;
  }
  if (!paymentMethodId) {
    try {
      const customer = await stripe.customers.retrieve(
        profile.stripe_customer_id as string,
      );
      if (!(customer as { deleted?: boolean }).deleted) {
        const pm = (customer as any).invoice_settings?.default_payment_method;
        if (pm) {
          paymentMethodId = typeof pm === "string" ? pm : pm.id;
        }
      }
    } catch (err) {
      console.warn("[stripe-change-tier] customer retrieve failed:", err);
    }
  }

  if (!paymentMethodId) {
    chargeFailed = "no_payment_method_on_file";
  } else {
    // Use PaymentIntent with off_session + confirm for a synchronous
    // card charge. The earlier invoice-item dance had two failure
    // modes: (a) the pending-item-to-invoice attachment occasionally
    // landed with amount_paid: 0 because the auto-pay path on
    // finalizeInvoice raced with our explicit pay(), and (b) we
    // surfaced 'invoice is already paid' as a fake failure even
    // when the card did charge.
    //
    // PaymentIntent.create({ confirm: true, off_session: true })
    // returns synchronously with the actual charge result — status
    // 'succeeded' or one of 'requires_action' / 'requires_payment_
    // method' / etc. when the card declines. amount on the response
    // is the actual amount the card was hit for.
    //
    // Tradeoff vs invoices: PaymentIntents don't auto-email a
    // receipt or appear in the customer's Invoices list. That's
    // acceptable here — vendors see the charge in their bank
    // statement and the subscription's normal monthly invoices
    // (which will start 30 days from now) handle ongoing billing.
    try {
      const intent = await stripe.paymentIntents.create({
        amount: unitAmountCents,
        currency: "usd",
        customer: profile.stripe_customer_id as string,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `${displayName} — first month (tier change)`,
        statement_descriptor_suffix: "Vendora",
        metadata: {
          kind: "tier_change_first_month",
          user_id: userId,
          subscription_id: sub.id,
          old_tier: oldTier,
          new_tier: (newPkg as any).tier,
        },
      });
      if (intent.status === "succeeded") {
        chargedNow = intent.amount;
      } else {
        chargeFailed = `payment_${intent.status}`;
      }
    } catch (err: any) {
      console.warn(
        "[stripe-change-tier] paymentIntent failed:",
        err?.message,
      );
      // Stripe throws on declines with a structured error; surface
      // the human-readable decline reason if present.
      chargeFailed =
        err?.raw?.decline_code ??
        err?.code ??
        err?.message ??
        "payment_failed";
    }
  }

  // Mirror Stripe's new state into profiles. Use the updated sub
  // returned by the API so period_start/period_end reflect the
  // billing_cycle_anchor reset.
  await db.from("profiles").update({
    subscription_tier: (newPkg as any).tier,
    subscription_status: updated.status,
    stripe_subscription_id: updated.id,
    subscription_current_period_end: new Date(
      updated.current_period_end * 1000,
    ).toISOString(),
    subscription_cancel_at_period_end: updated.cancel_at_period_end ?? false,
    monthly_grant: (newPkg as any).credits,
    period_started_at: new Date(updated.current_period_start * 1000).toISOString(),
    period_ends_at: new Date(updated.current_period_end * 1000).toISOString(),
  }).eq("id", userId);

  // Grant the new tier's full monthly credits ON TOP of the vendor's
  // existing balance. Idempotency key includes sub.id + the new
  // period_start + old→new tier, so repeated invocations within the
  // same period can't double-grant. The vendor "paid for both" so
  // they get both buckets (existing balance + new tier grant).
  const reconcileKey =
    `change_tier_${sub.id}_${updated.current_period_start}_${oldTier}_${(newPkg as any).tier}`;
  let grantedNow = 0;
  const { error: gerr } = await db.rpc("grant_credits", {
    p_user_id: userId,
    p_n: (newPkg as any).credits,
    p_kind: "monthly_grant",
    p_stripe_event_id: reconcileKey,
    p_stripe_invoice_id: null,
    p_note:
      `tier change (custom): ${oldTier} → ${(newPkg as any).tier} (+${(newPkg as any).credits})`,
  });
  if (!gerr) grantedNow = (newPkg as any).credits;

  return json(200, {
    changed: true,
    old_tier: oldTier,
    new_tier: (newPkg as any).tier,
    monthly_grant: (newPkg as any).credits,
    granted_now: grantedNow,
    charged_now_cents: chargedNow,
    charge_failed: chargeFailed,
    period_end: new Date(updated.current_period_end * 1000).toISOString(),
  });
});
