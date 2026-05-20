// Stripe webhook handler. Verifies the signature, dedupes by event
// id (Stripe retries until we 2xx), and dispatches per event type.
//
// Required env:
//   STRIPE_SECRET_KEY          — sk_test_... or sk_live_...
//   STRIPE_WEBHOOK_SECRET      — whsec_... from the webhook endpoint
//   SUPABASE_URL               — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  — auto-injected
//
// Endpoint URL (paste into Stripe dashboard → Developers → Webhooks):
//   https://<project>.functions.supabase.co/stripe-webhook
//
// Events handled:
//   account.updated            — sync vendor onboarding status
//   checkout.session.completed — mark proposal paid (deposit or full)
//   payment_intent.payment_failed — mark proposal failed
//
// IMPORTANT: this function must be deployed with --no-verify-jwt
// because Stripe doesn't send a Supabase JWT. Signature verification
// is what authenticates the request.

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

  // Stripe sends the raw body — we MUST verify against bytes, not
  // a re-serialized JSON. Use req.text() and constructEventAsync (deno
  // can't do sync HMAC the same way the node SDK does).
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

  // Idempotency: insert the event id first. If it conflicts, we've
  // already processed it (or a parallel retry won the race) — return
  // 200 so Stripe stops retrying. Storing the payload helps with
  // replay debugging; trim retention via a cron later.
  const { error: insertErr } = await db
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, payload: event as any });
  if (insertErr) {
    if (insertErr.code === "23505") {
      // Already processed — Stripe just retried us. Acknowledge.
      return new Response("ok (duplicate)", { status: 200 });
    }
    console.error("[stripe-webhook] failed to insert event log", insertErr);
    // Don't 200 — let Stripe retry.
    return new Response("db error", { status: 500 });
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const details = account.details_submitted ?? false;
        const charges = account.charges_enabled ?? false;
        const payouts = account.payouts_enabled ?? false;
        await db
          .from("vendor_profiles")
          .update({
            stripe_details_submitted: details,
            stripe_charges_enabled: charges,
            stripe_payouts_enabled: payouts,
            stripe_onboarding_completed_at:
              details && charges ? new Date().toISOString() : null,
          })
          .eq("stripe_account_id", account.id);
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const proposalId = session.metadata?.proposal_id;
        const mode = session.metadata?.mode;
        if (!proposalId) break;
        const update: Record<string, unknown> = {
          stripe_payment_intent_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null,
        };
        if (mode === "deposit") {
          update.payment_status = "deposit_paid";
          update.deposit_paid_at = new Date().toISOString();
        } else {
          update.payment_status = "paid_in_full";
          update.paid_in_full_at = new Date().toISOString();
        }
        await db.from("proposals").update(update).eq("id", proposalId);
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const proposalId = intent.metadata?.proposal_id;
        if (!proposalId) break;
        await db
          .from("proposals")
          .update({ payment_status: "failed" })
          .eq("id", proposalId);
        break;
      }
      default:
        // Event recorded for audit but no handler. That's fine —
        // Stripe lets us subscribe broadly and ignore.
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error", event.type, err);
    // Roll back the dedup row so a retry can re-attempt. Without this
    // a transient handler failure would cause permanent silent drop.
    await db.from("stripe_events").delete().eq("id", event.id);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
