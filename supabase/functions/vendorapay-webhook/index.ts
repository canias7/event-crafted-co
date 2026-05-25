// VendoraPay Phase 1: POST /webhooks/vendorapay
//
// Source of truth for payment state changes. Verifies signature
// via the abstraction's handleWebhookEvent (no raw stripe.webhooks
// call here — module boundary preserved).
//
// Handles the five Phase 1 events:
//   account.updated    → mirror onboarding bools to vendor_payment_secrets
//   payment.succeeded  → flip proposal.payment_status
//   payment.failed     → log + mark failed (vendor can retry)
//   charge.refunded    → record refund + reset payment_status
//   charge.disputed    → log + notify (manual handling for now)
//
// Idempotent: every processed event id is stored in stripe_events;
// a retry of the same id 200s immediately without re-processing.
// (Reuses the existing stripe_events log so we don't double-process
// across the legacy stripe-webhook and this one.)
//
// Deployed with verify_jwt=false — the provider doesn't send a
// Supabase JWT; signature verification IS the authentication.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { handleWebhookEvent } from "../_shared/payments.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const raw = await req.text();
  let event;
  try {
    event = await handleWebhookEvent(raw, signature);
  } catch (err) {
    console.error("[vendorapay-webhook] signature verify failed", err);
    return new Response("invalid signature", { status: 400 });
  }
  if (!event) {
    // Unknown event type — ack so the provider stops retrying.
    return new Response("ok (ignored)", { status: 200 });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Dedupe via the shared events table — legacy stripe-webhook uses
  // the same one, so this prevents double-processing across both
  // routes during the transition.
  const { error: insertErr } = await db
    .from("stripe_events")
    .insert({ id: event.id, type: event.kind, payload: event.raw as any });
  if (insertErr) {
    if (insertErr.code === "23505") {
      return new Response("ok (duplicate)", { status: 200 });
    }
    console.error("[vendorapay-webhook] log insert failed", insertErr);
    return new Response("db error", { status: 500 });
  }

  try {
    switch (event.kind) {
      case "account.updated": {
        // Capabilities flipped — mirror onto the secrets row.
        const account = event.raw.data.object as {
          id: string;
          charges_enabled?: boolean;
          payouts_enabled?: boolean;
          details_submitted?: boolean;
        };
        await db
          .from("vendor_payment_secrets")
          .update({
            charges_enabled: Boolean(account.charges_enabled),
            payouts_enabled: Boolean(account.payouts_enabled),
            details_submitted: Boolean(account.details_submitted),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_account_id", account.id);
        break;
      }

      case "payment.succeeded": {
        const pi = event.raw.data.object as {
          id: string;
          amount: number;
          metadata?: Record<string, string>;
        };
        const proposalId = pi.metadata?.proposal_id;
        const mode = pi.metadata?.mode;
        if (!proposalId) break;
        // Mark deposit-paid vs paid-in-full based on the mode the
        // client requested. The charge endpoint validated the
        // amount, so we trust the mode coming through metadata.
        const nextStatus = mode === "deposit" ? "deposit_paid" : "paid_in_full";
        await db
          .from("proposals")
          .update({ payment_status: nextStatus })
          .eq("id", proposalId);
        break;
      }

      case "payment.failed": {
        const pi = event.raw.data.object as {
          id: string;
          last_payment_error?: { message?: string };
          metadata?: Record<string, string>;
        };
        const proposalId = pi.metadata?.proposal_id;
        if (!proposalId) break;
        console.warn(
          "[vendorapay-webhook] payment.failed",
          proposalId,
          pi.last_payment_error?.message,
        );
        // Don't flip payment_status — the host can retry. Just
        // log; a future "failed payments" surface can read
        // stripe_events.
        break;
      }

      case "charge.refunded": {
        const ch = event.raw.data.object as {
          id: string;
          payment_intent?: string | null;
          amount: number;
          amount_refunded: number;
        };
        if (!ch.payment_intent) break;
        // Find the proposal we charged earlier (we stamped the
        // PaymentIntent id onto stripe_checkout_session_id at
        // charge time — same column, different semantic).
        const { data: proposal } = await db
          .from("proposals")
          .select("id, payment_status")
          .eq("stripe_checkout_session_id", ch.payment_intent)
          .maybeSingle();
        if (!proposal) break;
        const isFullRefund = ch.amount_refunded >= ch.amount;
        await db
          .from("proposals")
          .update({
            payment_status: isFullRefund ? "refunded" : "partial_refund",
          })
          .eq("id", proposal.id);
        break;
      }

      case "charge.disputed": {
        const d = event.raw.data.object as {
          charge: string;
          amount: number;
          reason: string;
        };
        // Chargebacks: log + leave the proposal alone until the
        // dispute resolves. If it's lost, the refund event flips
        // payment_status; if won, no further action.
        console.warn(
          "[vendorapay-webhook] charge.disputed",
          { charge: d.charge, amount: d.amount, reason: d.reason },
        );
        break;
      }
    }
  } catch (err) {
    console.error("[vendorapay-webhook] handler error", event.kind, err);
    // Roll back the dedupe row so the provider retries.
    await db.from("stripe_events").delete().eq("id", event.id);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
