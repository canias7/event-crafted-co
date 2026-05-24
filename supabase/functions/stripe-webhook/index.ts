// Stripe webhook handler. Verifies the signature, dedupes by event
// id (Stripe retries until we 2xx), syncs subscription state onto
// profiles (per-user — was on vendor_profiles per-listing before,
// see migration 20260524000000_subscription_state_to_profiles), AND
// grants AI credits from the credit ledger based on the price ID
// -> credits map in vendor_credit_packages.
//
// Required env:
//   STRIPE_SECRET_KEY          — sk_test_... or sk_live_...
//   STRIPE_WEBHOOK_SECRET      — whsec_... from the webhook endpoint
//
// Deployed with verify_jwt=false because Stripe doesn't send a
// Supabase JWT — signature verification is what authenticates.
//
// Events handled:
//   checkout.session.completed     — subscription: stamp tier + grant first month's credits
//                                    payment (topup): grant top-up credits
//   customer.subscription.created  — alt entry path (e.g. portal)
//   customer.subscription.updated  — renewal, plan change, cancel-at-period-end toggle
//   customer.subscription.paused   — pause from portal -> status=paused, monthly_grant=0
//   customer.subscription.resumed  — resume from portal -> status=active
//   customer.subscription.deleted  — subscription ends -> tier=free
//   invoice.paid                   — recurring renewal -> grant another month's credits
//   invoice.payment_failed         — card declined -> status=past_due (Stripe handles dunning)
//   charge.refunded                — refund issued -> revoke matching top-up credits
//   charge.dispute.created         — chargeback opened -> log only (Stripe fires
//                                    refund separately on a lost dispute)
//
// Credit grants use stripe_event_id for idempotency: the unique
// partial index on vendor_credit_transactions makes a duplicate
// event INSERT fail, which rolls back the grant transaction. So
// Stripe retrying an event we already credited just no-ops.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface PackageRow {
  stripe_price_id: string;
  kind: "subscription" | "topup";
  tier: "starter" | "pro" | "studio" | null;
  credits: number;
  display_name: string;
}

// Audit H3: filtering on active=true means a deactivated package
// silently kills renewal grants for vendors still subscribed to that
// price. Fall back to a no-active-filter lookup so renewals always
// find their package; log loudly when we're rescuing an inactive
// row so ops sees the drift.
async function lookupPackage(
  db: any,
  priceId: string,
): Promise<PackageRow | null> {
  const { data: active } = await db
    .from("vendor_credit_packages")
    .select("stripe_price_id, kind, tier, credits, display_name")
    .eq("stripe_price_id", priceId)
    .eq("active", true)
    .maybeSingle();
  if (active) return active as PackageRow;

  const { data: any_row } = await db
    .from("vendor_credit_packages")
    .select("stripe_price_id, kind, tier, credits, display_name")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  if (any_row) {
    console.warn(
      "[stripe-webhook] package row is inactive but still in use",
      priceId,
    );
    return any_row as PackageRow;
  }
  return null;
}

// Resolve a user_id from the Stripe customer id via profiles. The
// credit ledger keys on auth.users.id, which equals profiles.id.
async function resolveUserId(
  db: any,
  customerId: string,
): Promise<string | null> {
  const { data } = await db
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

// Translate a vendor_profiles.id (the listing id we stamp into
// session.metadata.vendor_id) into the owning auth user_id. Used
// in checkout.session.completed where the session carries the
// listing id, not the user id.
async function vendorIdToUserId(
  db: any,
  vendorId: string,
): Promise<string | null> {
  const { data } = await db
    .from("vendor_profiles")
    .select("user_id")
    .eq("id", vendorId)
    .maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

async function grantCredits(
  db: any,
  userId: string,
  n: number,
  kind: "monthly_grant" | "topup",
  stripeEventId: string,
  stripeInvoiceId: string | null,
  note: string,
): Promise<{ ok: true; balance: number } | { ok: false; reason: string }> {
  const { data, error } = await db.rpc("grant_credits", {
    p_user_id: userId,
    p_n: n,
    p_kind: kind,
    p_stripe_event_id: stripeEventId,
    p_stripe_invoice_id: stripeInvoiceId,
    p_note: note,
  });
  if (error) {
    // Unique violation on stripe_event_id = idempotent replay. Treat
    // as success so Stripe's retry gets a 200.
    if ((error.code ?? "") === "23505") {
      console.log("[stripe-webhook] grant idempotent skip", stripeEventId);
      return { ok: true, balance: -1 };
    }
    console.error("[stripe-webhook] grant_credits failed", error);
    return { ok: false, reason: error.message ?? String(error) };
  }
  return { ok: true, balance: (data as number) ?? 0 };
}

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
        const vendorId = session.metadata?.vendor_id;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;

        if (session.mode === "subscription") {
          // Subscription checkout: stamp tier + grant first month's
          // credits. Renewals fire invoice.paid (handled below).
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id;
          if (!vendorId || !subscriptionId) break;
          // vendor_id in session.metadata is the listing id we
          // launched checkout from; resolve to the owning user so
          // subscription state lands on the user-scoped profile row.
          const userId = await vendorIdToUserId(db, vendorId);
          if (!userId) break;
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0]?.price?.id;
          const pkg = priceId ? await lookupPackage(db, priceId) : null;
          await applySubscription(db, userId, customerId ?? null, sub, pkg);

          if (pkg && pkg.kind === "subscription") {
            await grantCredits(
              db, userId, pkg.credits,
              "monthly_grant", event.id,
              typeof session.invoice === "string" ? session.invoice : null,
              `checkout: ${pkg.display_name} initial month`,
            );
          }
        } else if (session.mode === "payment") {
          // One-time payment (top-up). Pull the line items to find
          // the price ID (session.amount_total is the total, not
          // useful for routing).
          if (!customerId) break;
          const items = await stripe.checkout.sessions.listLineItems(
            session.id,
            { limit: 5 },
          );
          // payment_intent on the checkout session is the canonical
          // link back to the charge that will (eventually) refund.
          // Stash it on every top-up row so charge.refunded can
          // find the matching grant.
          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;
          for (const item of items.data) {
            const priceId = item.price?.id;
            if (!priceId) continue;
            const pkg = await lookupPackage(db, priceId);
            if (!pkg || pkg.kind !== "topup") continue;
            const userId = await resolveUserId(db, customerId);
            if (!userId) continue;
            const qty = item.quantity ?? 1;
            const result = await grantCredits(
              db, userId, pkg.credits * qty,
              "topup", event.id,
              typeof session.invoice === "string" ? session.invoice : null,
              `topup: ${pkg.display_name} x${qty}`,
            );
            // Stamp payment_intent_id on the just-granted row. Skip
            // when the grant was an idempotent replay (sentinel
            // balance: -1 from grantCredits) — the row already has
            // the payment_intent from the first run.
            if (result.ok && result.balance !== -1 && paymentIntentId) {
              await db
                .from("vendor_credit_transactions")
                .update({ stripe_payment_intent_id: paymentIntentId })
                .eq("stripe_event_id", event.id);
            }
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const priceId = sub.items.data[0]?.price?.id;
        const pkg = priceId ? await lookupPackage(db, priceId) : null;
        // Resolution order: subscription.metadata.user_id -> existing
        // profiles row by stripe_customer_id -> derive from vendor_id
        // -> Customer.metadata.user_id|vendor_id. Covers checkouts
        // we launched, portal-initiated changes, and Stripe-side
        // subscription creates.
        let userId = sub.metadata?.user_id ?? null;
        if (!userId) {
          userId = await resolveUserId(db, customerId);
        }
        let vendorIdMeta = sub.metadata?.vendor_id;
        if (!userId && vendorIdMeta) {
          userId = await vendorIdToUserId(db, vendorIdMeta);
        }
        if (!userId) {
          // Last-chance fallback: read user_id / vendor_id off the
          // Stripe Customer's metadata (set when this sub was
          // created outside our flow — e.g. the portal).
          const cust = await stripe.customers.retrieve(customerId);
          const meta = (cust as Stripe.Customer).metadata ?? {};
          userId = meta.user_id ?? null;
          if (!userId && meta.vendor_id) {
            userId = await vendorIdToUserId(db, meta.vendor_id);
          }
        }
        if (userId) {
          await applySubscription(db, userId, customerId, sub, pkg);
        }
        // Note: no credit grant here — checkout.session.completed
        // already granted the first month, and invoice.paid handles
        // renewals. Tier changes (upgrade/downgrade) deliberately
        // don't double-grant; the new tier takes effect at the next
        // billing cycle's invoice.paid.
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await db
          .from("profiles")
          .update({
            subscription_tier: "free",
            subscription_status: "canceled",
            stripe_subscription_id: null,
            // We keep stripe_customer_id around so resubscribing
            // reuses the existing Stripe Customer (preserves card
            // on file + invoice history under one record).
            subscription_cancel_at_period_end: false,
            // Null the period end too (audit M2) so a stale value
            // doesn't leak into "your plan ends on..." surfaces
            // after the sub is gone.
            subscription_current_period_end: null,
            monthly_grant: 0,
            period_started_at: null,
            period_ends_at: null,
          })
          .eq("stripe_customer_id", customerId);
        // Credits are NOT clawed back on cancellation — vendor
        // already paid for them and can spend down through the end
        // of the billing period (or beyond, if they had top-ups).
        break;
      }

      case "invoice.paid": {
        // Recurring subscription renewal. Grant the tier's monthly
        // credit allotment. Skip when billing_reason is anything
        // other than 'subscription_cycle' — `subscription_create`
        // is covered by checkout.session.completed and
        // `subscription_update` is a mid-cycle plan change that
        // would otherwise double-grant on top of the current
        // period's credits (audit #7). Vendor pays the prorated
        // upgrade charge for the feature unlock; the new tier's
        // full credit allotment lands on the next cycle.
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.billing_reason !== "subscription_cycle") break;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        if (!customerId) break;
        const priceId = invoice.lines.data[0]?.price?.id;
        if (!priceId) break;
        const pkg = await lookupPackage(db, priceId);
        if (!pkg || pkg.kind !== "subscription") break;
        const userId = await resolveUserId(db, customerId);
        if (!userId) break;
        await grantCredits(
          db, userId, pkg.credits,
          "monthly_grant", event.id, invoice.id ?? null,
          `renewal: ${pkg.display_name} ${invoice.billing_reason}`,
        );
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
          .from("profiles")
          .update({ subscription_status: "past_due" })
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "customer.subscription.paused": {
        // Stripe portal can pause a subscription. We flip
        // subscription_status + zero out monthly_grant so the
        // usage page bar stops showing "X / Y this period" against
        // a grant that won't refill while paused. The next
        // resumed event re-establishes monthly_grant from the
        // package; the next invoice.paid grants the next cycle's
        // credits.
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await db
          .from("profiles")
          .update({
            subscription_status: "paused",
            monthly_grant: 0,
          })
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "customer.subscription.resumed": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const priceId = sub.items.data[0]?.price?.id;
        const pkg = priceId ? await lookupPackage(db, priceId) : null;
        const userId = await resolveUserId(db, customerId);
        if (userId) {
          // applySubscription re-stamps status + restores
          // monthly_grant from the package. No credit grant — the
          // next invoice.paid handles that.
          await applySubscription(db, userId, customerId, sub, pkg);
        }
        break;
      }

      case "charge.refunded": {
        // Top-up refunds: revoke matching credits. Subscription
        // refunds: skipped — those credits were granted to spend
        // during the billing period and the vendor likely already
        // used them; we don't claw back retroactively.
        //
        // Detection: top-up charges have no invoice (Stripe payment
        // mode), subscription charges have one. We also confirm via
        // the payment_intent's metadata.kind === 'credit_topup'
        // before debiting anything.
        const charge = event.data.object as Stripe.Charge;
        if (charge.invoice) {
          console.log("[stripe-webhook] charge.refunded for subscription invoice — skipping revocation", charge.id);
          break;
        }
        const piId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (!piId) break;

        const pi = await stripe.paymentIntents.retrieve(piId);
        if (pi.metadata?.kind !== "credit_topup") {
          console.log("[stripe-webhook] charge.refunded with non-topup payment_intent — skipping", piId);
          break;
        }
        // Find the original grant by payment_intent_id (we now stamp
        // it on top-up rows, see grant block in checkout.session.completed).
        const { data: original } = await db
          .from("vendor_credit_transactions")
          .select("user_id, delta")
          .eq("stripe_payment_intent_id", piId)
          .eq("kind", "topup")
          .maybeSingle();
        if (!original) {
          console.warn("[stripe-webhook] charge.refunded but no original topup row found", piId);
          break;
        }
        // Prorate revocation: full refund -> revoke full credit
        // amount, partial -> credits * (amount_refunded / amount).
        const refundRatio =
          charge.amount > 0
            ? (charge.amount_refunded ?? 0) / charge.amount
            : 1;
        const toRevoke = Math.round((original.delta as number) * refundRatio);
        if (toRevoke <= 0) break;

        const { error: revokeErr } = await db.rpc("revoke_topup_credits", {
          p_user_id: original.user_id,
          p_n: toRevoke,
          p_stripe_event_id: event.id,
          p_stripe_payment_intent_id: piId,
          p_note: `refund of charge ${charge.id}${refundRatio < 1 ? ` (${Math.round(refundRatio * 100)}% partial)` : ""}`,
        });
        if (revokeErr && (revokeErr.code ?? "") !== "23505") {
          console.error("[stripe-webhook] revoke_topup_credits failed", revokeErr);
        }
        break;
      }

      case "charge.dispute.created": {
        // Chargebacks: don't auto-revoke. Dispute may be won or
        // lost; if lost, Stripe fires charge.refunded which the
        // handler above takes care of. This event is informational
        // — surface it in logs so an admin can intervene if they
        // want to proactively pause access.
        const dispute = event.data.object as Stripe.Dispute;
        console.warn(
          "[stripe-webhook] charge.dispute.created",
          { charge: dispute.charge, amount: dispute.amount, reason: dispute.reason },
        );
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error", event.type, err);
    // Delete the dedup row so Stripe's retry gets a fresh shot
    // instead of being acked as already-processed.
    //
    // SAFETY: if grant_credits already succeeded before the throw,
    // the retry will fire grant_credits again — protected from
    // double-grant only by the unique partial index on
    // vendor_credit_transactions.stripe_event_id (the second grant
    // hits 23505, which grantCredits treats as success). Same for
    // revoke_topup_credits via its own unique-event-id constraint.
    // Any future change that bypasses those indices could
    // double-credit on retry.
    await db.from("stripe_events").delete().eq("id", event.id);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});

async function applySubscription(
  db: any,
  userId: string,
  customerId: string | null,
  sub: Stripe.Subscription,
  pkg: PackageRow | null,
) {
  const active = sub.status === "active" || sub.status === "trialing";
  // Tier picks the package's tier when active, else 'free'. If
  // package lookup misses (rare: price row dropped while a sub
  // still active), fall back to the user's CURRENT tier on
  // profiles — never silently flip a paying Starter to "pro" just
  // because the catalog row went missing (audit M1).
  let tier: string;
  if (!active) {
    tier = "free";
  } else if (pkg?.tier) {
    tier = pkg.tier;
  } else {
    const { data: current } = await db
      .from("profiles")
      .select("subscription_tier")
      .eq("id", userId)
      .maybeSingle();
    tier = (current?.subscription_tier as string) ?? "free";
    console.warn(
      "[stripe-webhook] applySubscription: pkg.tier missing, preserving current tier",
      { userId, tier },
    );
  }
  const monthlyGrant = active && pkg?.kind === "subscription" ? pkg.credits : 0;
  const update: Record<string, unknown> = {
    subscription_status: sub.status,
    subscription_tier: tier,
    stripe_subscription_id: sub.id,
    subscription_current_period_end: new Date(
      sub.current_period_end * 1000,
    ).toISOString(),
    subscription_cancel_at_period_end: sub.cancel_at_period_end ?? false,
    monthly_grant: monthlyGrant,
    period_started_at: new Date(sub.current_period_start * 1000).toISOString(),
    period_ends_at: new Date(sub.current_period_end * 1000).toISOString(),
  };
  if (customerId) update.stripe_customer_id = customerId;
  await db.from("profiles").update(update).eq("id", userId);
}
