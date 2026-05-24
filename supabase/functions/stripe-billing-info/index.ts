// Returns the vendor's billing summary for the subscription page:
// the saved payment method (card brand + last4) and the last N
// invoices (with Stripe-hosted invoice URLs so the front end can
// link "View" without needing the Stripe Customer Portal round-trip).
//
// Auth: vendor JWT.
//
// Required env:
//   STRIPE_SECRET_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_ANON_KEY

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

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: profile } = await db
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  const customerId = profile?.stripe_customer_id as string | undefined;
  if (!customerId) {
    return json(200, { card: null, invoices: [] });
  }

  // Resolve the saved card via the customer's
  // invoice_settings.default_payment_method first (most accurate),
  // then any subscription's default_payment_method, then any
  // attached card. Returns null if none on file (free / trial).
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;
  let cardExpMonth: number | null = null;
  let cardExpYear: number | null = null;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    let pmId: string | null = null;
    if (!(customer as { deleted?: boolean }).deleted) {
      const pm = (customer as any).invoice_settings?.default_payment_method;
      if (pm) pmId = typeof pm === "string" ? pm : pm.id;
    }
    if (!pmId) {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 1,
      });
      const sub = subs.data[0];
      if (sub?.default_payment_method) {
        pmId = typeof sub.default_payment_method === "string"
          ? sub.default_payment_method
          : (sub.default_payment_method as { id: string }).id;
      }
    }
    if (!pmId) {
      const pms = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 1,
      });
      const first = pms.data[0];
      if (first?.id) pmId = first.id;
    }
    if (pmId) {
      const pm = await stripe.paymentMethods.retrieve(pmId);
      if (pm.card) {
        cardBrand = pm.card.brand ?? null;
        cardLast4 = pm.card.last4 ?? null;
        cardExpMonth = pm.card.exp_month ?? null;
        cardExpYear = pm.card.exp_year ?? null;
      }
    }
  } catch (err) {
    console.warn("[stripe-billing-info] card lookup failed:", err);
  }

  // Recent invoices (up to 30 raw, capped to 10 useful). Drop:
  //   - draft invoices (not finalized, not customer-facing)
  //   - zero-amount invoices (Stripe creates these as a side-effect
  //     of subscription updates with billing_cycle_anchor: 'now' +
  //     proration_behavior: 'none' — cycle-reset placeholders with
  //     no line items. They look like '$0.00 Paid' noise in the UI
  //     even though they're technically real Stripe records.)
  // Surface line-item summary so the UI can distinguish e.g. "Pro
  // monthly" from "Studio first month (tier change)".
  let invoices: Array<Record<string, unknown>> = [];
  try {
    const list = await stripe.invoices.list({
      customer: customerId,
      limit: 30,
      status: undefined,
      expand: ["data.lines"],
    });
    invoices = list.data
      .filter((inv) => inv.status !== "draft")
      .filter((inv) => (inv.amount_paid ?? 0) > 0 || (inv.amount_due ?? 0) > 0)
      .slice(0, 10)
      .map((inv) => {
        const lines = (inv.lines?.data ?? []).map((line) => ({
          description: line.description ?? null,
          amount: line.amount ?? 0,
        }));
        const firstLine = lines[0];
        const summary =
          inv.description ??
          firstLine?.description ??
          (lines.length
            ? `${lines.length} line item${lines.length === 1 ? "" : "s"}`
            : null);
        return {
          id: inv.id,
          number: inv.number ?? null,
          created: inv.created,
          amount_paid: inv.amount_paid ?? 0,
          amount_due: inv.amount_due ?? 0,
          subtotal: inv.subtotal ?? 0,
          tax: inv.tax ?? 0,
          currency: inv.currency ?? "usd",
          status: inv.status ?? "open",
          summary,
          lines,
          hosted_invoice_url: inv.hosted_invoice_url ?? null,
          invoice_pdf: inv.invoice_pdf ?? null,
        };
      });
  } catch (err) {
    console.warn("[stripe-billing-info] invoice list failed:", err);
  }

  return json(200, {
    card: cardLast4
      ? {
          brand: cardBrand,
          last4: cardLast4,
          exp_month: cardExpMonth,
          exp_year: cardExpYear,
        }
      : null,
    invoices,
  });
});
