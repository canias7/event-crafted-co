// Stripe webhook handler. Verifies the signature, dedupes by event
// id (Stripe retries until we 2xx), and syncs subscription state
// onto vendor_profiles.
//
// Required env:
//   STRIPE_SECRET_KEY          — sk_test_... or sk_live_...
//   STRIPE_WEBHOOK_SECRET      — whsec_... from the webhook endpoint
//
// Deployed with verify_jwt=false because Stripe doesn't send a
// Supabase JWT — signature verification is what authenticates.
//
// Events handled:
//   checkout.session.completed     — first checkout finishes, customer + sub IDs land
//   customer.subscription.created  — alt entry path (e.g. portal-initiated)
//   customer.subscription.updated  — renewal, plan change, cancel-at-period-end toggle
//   customer.subscription.deleted  — subscription ends → tier=free
//   invoice.payment_failed         — card declined → status=past_due (Stripe handles dunning)

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (
    !STRIPE_SECRET_KEY ||
    !STRIPE_WEBHOOK_SECRET ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return new Response("Secrets not configured", { status: 500 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      raw,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed", err);
    return new Response("invalid signature", { status: 400 });
  }

  const db = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Idempotency log keyed on Stripe's event id. PK conflict means
  // "already processed" — Stripe retries until we 2xx, so this
  // prevents double-processing on retry.
  const { error: insertErr } = await db
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, payload: event as any });
  if (insertErr) {
    if (insertErr.code === "23505") {
      return new Response("ok (duplicate)", { status: 200 });
    }
    console.error("[stripe-webhook] failed to insert event log", insertErr);
    return new Response("db error", { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // We only act on subscription-mode sessions. Anything else
        // would be a stray (we don't run any other Checkout flows).
        if (session.mode !== "subscription") break;
        const vendorId = session.metadata?.vendor_id;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!vendorId || !subscriptionId) break;
        // Fetch the subscription so we can stamp the accurate
        // status + period_end immediately, instead of waiting for
        // the customer.subscription.created event that fires
        // adjacently. Stripe doesn't guarantee event ordering.
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await applySubscription(db, vendorId, customerId ?? null, sub);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const vendorId = sub.metadata?.vendor_id;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        if (!vendorId) {
          // Fallback: vendor_id may live on the Customer metadata
          // if this sub was created outside our flow (e.g. portal).
          const cust = await stripe.customers.retrieve(customerId);
          const vid = (cust as Stripe.Customer).metadata?.vendor_id;
          if (vid) await applySubscription(db, vid, customerId, sub);
          break;
        }
        await applySubscription(db, vendorId, customerId, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await db
          .from("vendor_profiles")
          .update({
            subscription_tier: "free",
            subscription_status: "canceled",
            stripe_subscription_id: null,
            // We keep stripe_customer_id around so resubscribing
            // reuses the existing Stripe Customer (preserves card
            // on file + invoice history under one record).
            subscription_cancel_at_period_end: false,
          })
          .eq("stripe_customer_id", customerId);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        if (!customerId) break;
        // Don't downgrade tier here — Stripe's dunning will retry
        // the card a few times. Tier flips to free only when
        // subscription.deleted lands (after dunning exhausts).
        await db
          .from("vendor_profiles")
          .update({ subscription_status: "past_due" })
          .eq("stripe_customer_id", customerId);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error", event.type, err);
    // Roll back the dedup row so Stripe's retry gets a fresh shot
    // instead of being acked as already-processed.
    await db.from("stripe_events").delete().eq("id", event.id);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});

async function applySubscription(
  db: any,
  vendorId: string,
  customerId: string | null,
  sub: Stripe.Subscription,
) {
  const tier =
    sub.status === "active" || sub.status === "trialing" ? "pro" : "free";
  const update: Record<string, unknown> = {
    subscription_status: sub.status,
    subscription_tier: tier,
    stripe_subscription_id: sub.id,
    subscription_current_period_end: new Date(
      sub.current_period_end * 1000,
    ).toISOString(),
    subscription_cancel_at_period_end: sub.cancel_at_period_end ?? false,
  };
  if (customerId) update.stripe_customer_id = customerId;
  await db.from("vendor_profiles").update(update).eq("id", vendorId);
}
