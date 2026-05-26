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
import { getReceiptEmailForPI, handleWebhookEvent } from "../_shared/payments.ts";

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
        // Currency for the receipt. Default to the PI's currency
        // (Stripe always sets this on a real charge) — the invoice
        // branch below overrides with the invoice's recorded
        // currency for an extra layer of safety.
        let currencyForNotify = pi.currency ?? "usd";

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
          // receipt_email is null when Stripe Checkout collected the
          // email (rather than us setting it upfront). Pull from
          // latest_charge.billing_details so the scheduled-balance
          // reminder flow has a recipient.
          let hostEmailForLink = pi.receipt_email ?? null;
          if (!hostEmailForLink) {
            try { hostEmailForLink = await getReceiptEmailForPI(pi.id); }
            catch (err) { console.error("[vendorapay-webhook] PI email lookup failed", err); }
          }
          const { data: linkRow } = await db
            .from("payment_links")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              paid_payment_intent_id: pi.id,
              host_email: hostEmailForLink,
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentLinkId)
            .select("vendor_id, title, currency")
            .maybeSingle();
          const lRow = linkRow as { vendor_id?: string; title?: string; currency?: string | null } | null;
          if (lRow?.vendor_id) vendorIdForNotify = lRow.vendor_id;
          if (lRow?.title) descriptionForNotify = lRow.title;
          if (!hostEmailForNotify) hostEmailForNotify = hostEmailForLink;
          // Same currency-of-record override as the invoice branch:
          // prefer the link's stored currency over the PI's so a
          // PI without currency (test fixture, edge case) still
          // renders the receipt in the buyer's actual currency.
          if (lRow?.currency) currencyForNotify = lRow.currency;
        } else if (invoiceId) {
          const { data: invRow } = await db
            .from("invoices")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              paid_payment_intent_id: pi.id,
              // Clear any prior decline state so the UI doesn't
              // keep showing "card declined" on a now-paid invoice.
              payment_failure_message: null,
              payment_failed_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", invoiceId)
            .select("vendor_id, invoice_number, bill_to_email, currency")
            .maybeSingle();
          const iRow = invRow as { vendor_id?: string; invoice_number?: string; bill_to_email?: string | null; currency?: string | null } | null;
          if (iRow?.vendor_id) vendorIdForNotify = iRow.vendor_id;
          if (iRow?.invoice_number) descriptionForNotify = `Invoice ${iRow.invoice_number}`;
          if (!hostEmailForNotify && iRow?.bill_to_email) hostEmailForNotify = iRow.bill_to_email;
          // Prefer the invoice's recorded currency over Stripe's
          // PaymentIntent currency. They should match in practice,
          // but if the PI somehow lacks currency (legacy / edge
          // case) we still want the receipt to render in the
          // currency the invoice was issued in, not a hardcoded
          // 'usd' fallback.
          if (iRow?.currency) currencyForNotify = iRow.currency;
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
                currency: currencyForNotify,
                description: descriptionForNotify,
                host_email: hostEmailForNotify,
                payment_link_id: paymentLinkId ?? null,
                proposal_id: proposalId ?? null,
                invoice_id: invoiceId ?? null,
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
        const invoiceId = pi.metadata?.invoice_id;
        const failureMessage = pi.last_payment_error?.message ?? null;

        // Invoices: record the decline so the vendor sees the
        // invoice is stalled. We don't move status off "sent"
        // because the buyer can still retry by reopening the link.
        // Routed through an RPC that does an atomic SQL
        // increment so concurrent payment_failed events for the
        // same PI don't both read N and both write N+1.
        if (invoiceId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: rpcErr } = await (db as any).rpc(
            "invoice_record_payment_failure",
            { p_invoice_id: invoiceId, p_message: failureMessage },
          );
          if (rpcErr) {
            // Don't swallow — the RPC failing means payment_attempts
            // didn't increment and the failure message isn't on the
            // invoice. Most likely cause is the RPC missing on a
            // freshly-deployed environment (migration ordering) or
            // a permissions issue.
            console.error(
              "[vendorapay-webhook] invoice_record_payment_failure failed",
              invoiceId,
              rpcErr,
            );
          }
        }

        if (proposalId) {
          // Proposals: still just log. Future work can promote
          // failed proposal payments to the same row-level flag.
          console.warn(
            "[vendorapay-webhook] payment.failed (proposal)",
            proposalId,
            failureMessage,
          );
        }
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
        const nowIso = new Date().toISOString();

        // Try each of the three record types — at most one should
        // match because the PI is uniquely owned. Each branch is
        // a no-op if the row doesn't exist.
        await db
          .from("proposals")
          .update({ payment_status: nextStatus })
          .eq("stripe_checkout_session_id", ch.payment_intent);
        await db
          .from("payment_links")
          .update({ status: nextStatus, updated_at: nowIso })
          .eq("paid_payment_intent_id", ch.payment_intent);
        // Invoices: also stamp refunded_amount_cents (cumulative
        // per Stripe) and refunded_at so the Reports tab can show
        // refunds as a discrete line and compute Net = Gross − Refunds.
        await db
          .from("invoices")
          .update({
            status: nextStatus,
            refunded_amount_cents: ch.amount_refunded,
            refunded_at: nowIso,
            updated_at: nowIso,
          })
          .eq("paid_payment_intent_id", ch.payment_intent);
        break;
      }

      case "charge.disputed": {
        // Dispute lifecycle events all funnel through here — the
        // shared mapper normalizes created/updated/closed/funds_*
        // into one kind. dispute.status carries the actual state.
        const d = event.raw.data.object as {
          id: string;
          charge: string;
          payment_intent?: string | null;
          amount: number;
          currency?: string;
          reason?: string;
          status: string;
        };

        // Resolve which vendor owns the original charge so the
        // dispute shows up under the right listing. Look it up via
        // the payment_intent across all three record types.
        let vendorIdForDispute: string | null = null;
        if (d.payment_intent) {
          for (const table of ["invoices", "payment_links"] as const) {
            const { data } = await db
              .from(table)
              .select("vendor_id")
              .eq("paid_payment_intent_id", d.payment_intent)
              .maybeSingle();
            const r = data as { vendor_id?: string } | null;
            if (r?.vendor_id) {
              vendorIdForDispute = r.vendor_id;
              break;
            }
          }
          if (!vendorIdForDispute) {
            const { data: prop } = await db
              .from("proposals")
              .select("vendor_id")
              .eq("stripe_checkout_session_id", d.payment_intent)
              .maybeSingle();
            const r = prop as { vendor_id?: string } | null;
            if (r?.vendor_id) vendorIdForDispute = r.vendor_id;
          }
        }

        // Atomic upsert via RPC. The RPC's ON CONFLICT clause
        // takes the LATER vendor_id when a follow-up event has one
        // (so misattribution from a brittle first-event lookup can
        // be corrected by a later event), AND gates the whole
        // update on `excluded.last_event_created_at >= existing` so
        // Stripe webhook re-delivery of an OLDER event doesn't
        // revert a resolved dispute back to needs_response.
        //
        // Fail-closed when event.raw.created is missing: stamp 1970
        // so the row's existing timestamp will (almost) always be
        // newer and the WHERE clause SKIPs the update. Better to
        // drop a malformed event than to overwrite a real state.
        const rawCreatedSec = (event.raw as { created?: number }).created;
        const eventCreatedAt = new Date(
          (typeof rawCreatedSec === "number" && Number.isFinite(rawCreatedSec)
            ? rawCreatedSec
            : 0) * 1000,
        ).toISOString();
        const { data: dispApplied, error: dispErr } = await (db as any).rpc(
          "vendor_dispute_upsert",
          {
            p_stripe_dispute_id: d.id,
            p_vendor_id: vendorIdForDispute,
            p_charge_id: d.charge,
            p_payment_intent_id: d.payment_intent ?? null,
            p_amount_cents: d.amount,
            p_currency: d.currency ?? "usd",
            p_reason: d.reason ?? null,
            p_status: d.status,
            p_raw_payload: event.raw as unknown as Record<string, unknown>,
            p_event_created_at: eventCreatedAt,
          },
        );
        if (dispErr) {
          console.error(
            "[vendorapay-webhook] vendor_dispute_upsert failed",
            d.id,
            dispErr,
          );
        } else if (dispApplied === false) {
          // The RPC's WHERE clause filtered out the upsert because
          // this event's timestamp was older than what's already
          // recorded. Stripe webhook re-delivery is the expected
          // trigger. Log so ops can confirm out-of-order protection
          // is working (or notice if it's filtering real events).
          console.warn(
            "[vendorapay-webhook] dispute event SKIPPED as stale",
            d.id,
            d.status,
            eventCreatedAt,
          );
        }
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
