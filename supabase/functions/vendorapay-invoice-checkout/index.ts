// VendoraPay: POST /vendorapay-invoice-checkout { slug }
//
// Public endpoint. Looks up the invoice by slug, creates a Stripe
// Checkout Session with one line_item per invoice line (so the
// Stripe page shows the breakdown), applies tax as a separate
// line if set, returns the hosted URL.
//
// Vendor's tier sets the application_fee_amount, computed on the SUM
// of the line items Stripe actually charges (not the client-supplied
// total_cents column, which has no DB constraint tying it to the
// lines). metadata.invoice_id lets the webhook mark the invoice paid
// on payment_intent.succeeded.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { computePlatformFeeCents, normalizeTier } from "../_shared/platformFees.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
let _client: Stripe | null = null;
function client(): Stripe {
  if (!_client) {
    if (!STRIPE_SECRET_KEY) throw new Error("VendoraPay not configured");
    _client = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
  }
  return _client;
}

interface LineItem {
  name: string;
  description?: string | null;
  qty: number;
  unit_price_cents: number;
  total_cents?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const body = await req.json().catch(() => ({}));
    const slug = (body?.slug as string | undefined)?.trim();
    if (!slug) return json(400, { error: "slug required" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .select("id, vendor_id, invoice_number, line_items, subtotal_cents, tax_cents, tax_rate_bps, total_cents, currency, status, bill_to_email, vendor_tier_snapshot, late_fee_cents")
      .eq("slug", slug)
      .maybeSingle();
    if (invErr || !inv) return json(404, { error: "invoice not found" });
    if (!(inv.status === "sent" || inv.status === "overdue")) {
      return json(400, { error: `invoice is ${inv.status}` });
    }
    if ((inv.total_cents as number) < 50) return json(400, { error: "invoice total too small" });

    const { data: secret } = await admin
      .from("vendor_payment_secrets")
      .select("stripe_account_id, charges_enabled")
      .eq("vendor_id", inv.vendor_id)
      .maybeSingle();
    const sRow = secret as { stripe_account_id?: string | null; charges_enabled?: boolean | null } | null;
    if (!sRow?.stripe_account_id) {
      return json(400, { error: "vendor not ready to receive payments" });
    }
    // Re-verify charges_enabled live (cached value can be stale).
    let charges_live = Boolean(sRow.charges_enabled);
    try {
      const fresh = await client().accounts.retrieve(sRow.stripe_account_id);
      charges_live = Boolean(fresh.charges_enabled);
      if (charges_live !== Boolean(sRow.charges_enabled)) {
        await admin.from("vendor_payment_secrets").update({
          charges_enabled: charges_live,
          payouts_enabled: Boolean(fresh.payouts_enabled),
          details_submitted: Boolean(fresh.details_submitted),
          updated_at: new Date().toISOString(),
        }).eq("stripe_account_id", sRow.stripe_account_id);
      }
    } catch (err) {
      console.error("[vendorapay-invoice-checkout] account verify failed", err);
    }
    if (!charges_live) {
      return json(400, { error: "vendor not ready to receive payments" });
    }

    const { data: vp } = await admin
      .from("vendor_profiles")
      .select("business_name")
      .eq("id", inv.vendor_id)
      .maybeSingle();
    const vpRow = vp as { business_name?: string | null } | null;
    // Snapshot tier captured at send time (trigger). Falls back to
    // live tier for legacy rows. Plan changes after sending don't
    // affect the fee.
    const snapshotTier = (inv as { vendor_tier_snapshot?: string | null }).vendor_tier_snapshot;
    let tier;
    if (snapshotTier) {
      tier = normalizeTier(snapshotTier);
    } else {
      const { data: tierRaw } = await admin.rpc("get_vendor_subscription_tier", {
        p_vendor_id: inv.vendor_id,
      });
      tier = normalizeTier(tierRaw as string | null);
    }
    const items = (inv.line_items as unknown as LineItem[]) ?? [];
    const currency = (inv.currency as string) ?? "usd";
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items
      .filter((li) => li.qty > 0 && li.unit_price_cents > 0)
      .map((li) => ({
        quantity: li.qty,
        price_data: {
          currency,
          unit_amount: li.unit_price_cents,
          product_data: {
            name: li.name || "Line item",
            description: (li.description ?? undefined) as string | undefined,
          },
        },
      }));
    if (lineItems.length === 0) {
      // Fallback: invoice has no parseable line items — charge the total
      // as a single line so checkout still works.
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: inv.subtotal_cents as number,
          product_data: { name: `Invoice ${inv.invoice_number}` },
        },
      });
    }
    if ((inv.tax_cents as number) > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: inv.tax_cents as number,
          product_data: { name: `Tax (${((inv.tax_rate_bps as number) / 100).toFixed(2)}%)` },
        },
      });
    }
    // Late fee applied after the invoice was sent. Surfaced as its
    // own line so the buyer sees on the Stripe Checkout page WHY the
    // total is higher than the original invoice — no surprises.
    const lateFeeCents = (inv.late_fee_cents as number | null | undefined) ?? 0;
    if (lateFeeCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: lateFeeCents,
          product_data: { name: "Late fee" },
        },
      });
    }

    // Platform fee MUST be computed from the amount Stripe will actually
    // charge (the sum of the line items just built), NOT inv.total_cents.
    // total_cents is a client-supplied column with no DB constraint tying
    // it to the line items, so a vendor inserting an invoice directly
    // (bypassing the UI) could understate total_cents to shrink the
    // platform's commission while the buyer is still charged the real
    // line-item sum. Deriving the fee from the charged amount closes that
    // fee-evasion gap.
    const chargedCents = lineItems.reduce(
      (sum, li) =>
        sum + (li.price_data?.unit_amount ?? 0) * (li.quantity ?? 1),
      0,
    );
    const feeCents = computePlatformFeeCents(tier, chargedCents);

    const session = await client().checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: (inv.bill_to_email as string | null) ?? undefined,
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination: sRow.stripe_account_id },
        statement_descriptor: "VENDORAPAY",
        description: `${vpRow?.business_name ?? "VendoraPay"} — Invoice ${inv.invoice_number}`,
        metadata: {
          invoice_id: inv.id as string,
          vendor_id: inv.vendor_id as string,
          vendor_tier: tier,
        },
      },
      metadata: {
        invoice_id: inv.id as string,
        vendor_id: inv.vendor_id as string,
      },
      success_url: `${APP_URL}/pay/invoice/${slug}?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pay/invoice/${slug}?status=cancelled`,
    });

    return json(200, { url: session.url });
  } catch (err) {
    console.error("[vendorapay-invoice-checkout] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: "checkout_failed", detail: message.slice(0, 240) });
  }
});
