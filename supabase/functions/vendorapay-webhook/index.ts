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
          currency?: string;
          description?: string | null;
          receipt_email?: string | null;
          metadata?: Record<string, string>;
        };
        const proposalId = pi.metadata?.proposal_id;
        const paymentLinkId = pi.metadata?.payment_link_id;
        const invoiceId = pi.metadata?.invoice_id;
        const vendorIdMeta = pi.metadata?.vendor_id;
        const mode = pi.metadata?.mode;
        let vendorIdForNotify: string | null = vendorIdMeta ?? null;
        let descriptionForNotify = pi.description ?? "VendoraPay charge";
        let hostEmailForNotify: string | null = pi.receipt_email ?? null;

        // Else-if chain: one PaymentIntent maps to exactly one
        // record. Without this guard a future double-tagged PI
        // (proposal_id + payment_link_id) would credit both records.
        if (proposalId) {
          const nextStatus = mode === "deposit" ? "deposit_paid" : "paid_in_full";
          const { data: prop } = await db
            .from("proposals")
            .update({ payment_status: nextStatus })
            .eq("id", proposalId)
            .select("vendor_id, host_id, title")
            .maybeSingle();
          const propRow = prop as { vendor_id?: string; host_id?: string; title?: string } | null;
          if (propRow?.vendor_id) vendorIdForNotify = propRow.vendor_id;
          if (propRow?.title) descriptionForNotify = `${propRow.title} — ${mode === "deposit" ? "deposit" : "balance"}`;
          if (!hostEmailForNotify && propRow?.host_id) {
            const { data: userRow } = await db.auth.admin.getUserById(propRow.host_id);
            hostEmailForNotify = userRow?.user?.email ?? null;
          }
        } else if (paymentLinkId) {
          const { data: linkRow } = await db
            .from("payment_links")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              paid_payment_intent_id: pi.id,
              host_email: pi.receipt_email ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentLinkId)
            .select("vendor_id, title")
            .maybeSingle();
          const lRow = linkRow as { vendor_id?: string; title?: string } | null;
          if (lRow?.vendor_id) vendorIdForNotify = lRow.vendor_id;
          if (lRow?.title) descriptionForNotify = lRow.title;
        } else if (invoiceId) {
          const { data: invRow } = await db
            .from("invoices")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              paid_payment_intent_id: pi.id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", invoiceId)
            .select("vendor_id, invoice_number, bill_to_email")
            .maybeSingle();
          const iRow = invRow as { vendor_id?: string; invoice_number?: string; bill_to_email?: string | null } | null;
          if (iRow?.vendor_id) vendorIdForNotify = iRow.vendor_id;
          if (iRow?.invoice_number) descriptionForNotify = `Invoice ${iRow.invoice_number}`;
          if (!hostEmailForNotify && iRow?.bill_to_email) hostEmailForNotify = iRow.bill_to_email;
        }

        // Fire notification side-effect. Best-effort; failures here
        // don't roll back the payment-status write.
        if (vendorIdForNotify) {
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/vendorapay-notify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                kind: "payment_received",
                vendor_id: vendorIdForNotify,
                amount_cents: pi.amount,
                currency: pi.currency ?? "usd",
                description: descriptionForNotify,
                host_email: hostEmailForNotify,
                payment_link_id: paymentLinkId ?? null,
                proposal_id: proposalId ?? null,
              }),
            });
          } catch (err) {
            console.error("[vendorapay-webhook] notify dispatch failed", err);
          }
        }
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
        const isFullRefund = ch.amount_refunded >= ch.amount;
        const nextStatus = isFullRefund ? "refunded" : "partial_refund";

        // Try each of the three record types — at most one should
        // match because the PI is uniquely owned. Each branch is
        // a no-op if the row doesn't exist.
        await db
          .from("proposals")
          .update({ payment_status: nextStatus })
          .eq("stripe_checkout_session_id", ch.payment_intent);
        await db
          .from("payment_links")
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq("paid_payment_intent_id", ch.payment_intent);
        await db
          .from("invoices")
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq("paid_payment_intent_id", ch.payment_intent);
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
    // Don't roll back the dedupe row — partial writes in this
    // handler have already committed, so a Stripe retry would
    // re-run the work and fire duplicate notification emails.
    // Log loud, ack 200, leave it to ops to reconcile manually.
    console.error("[vendorapay-webhook] handler error (NOT retried)", event.kind, event.id, err);
    return new Response("ok (partial: handler error)", { status: 200 });
  }

  return new Response("ok", { status: 200 });
});
