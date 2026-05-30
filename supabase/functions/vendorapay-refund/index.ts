// VendoraPay: POST /vendorapay-refund { business_id, payment_intent_id, amount_cents?, reason? }
//
// Vendor-initiated refund. Caller must be a team admin of the vendor.
// Full refund if amount_cents omitted. Reverses the destination
// transfer + the application fee so the vendor (and Vendora) both
// return their cut proportionally.
//
// Reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' (Stripe enum).
// Anything else falls back to 'requested_by_customer'.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

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

const VALID_REASONS = new Set(["duplicate", "fraudulent", "requested_by_customer"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "unauthorized" });

    const body = await req.json().catch(() => ({}));
    const businessId = body?.business_id as string | undefined;
    const paymentIntentId = body?.payment_intent_id as string | undefined;
    const amountCents = body?.amount_cents as number | undefined;
    const reasonRaw = (body?.reason as string | undefined) ?? "requested_by_customer";
    if (!businessId) return json(400, { error: "business_id required" });
    if (!paymentIntentId) return json(400, { error: "payment_intent_id required" });
    if (amountCents !== undefined && (!Number.isInteger(amountCents) || amountCents < 50)) {
      return json(400, { error: "amount_cents must be an integer >= 50" });
    }
    const reason = VALID_REASONS.has(reasonRaw) ? reasonRaw : "requested_by_customer";

    const { data: isAdmin } = await userClient.rpc("is_vendor_team_admin", { _vendor_id: businessId });
    if (!isAdmin) return json(403, { error: "admin role required" });

    // Sanity-check the PI belongs to this vendor before refunding
    // (defense in depth; Stripe would otherwise happily refund any PI
    // the platform owns regardless of which vendor's admin asked).
    let pi: Stripe.PaymentIntent;
    try {
      pi = await client().paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
    } catch (err) {
      console.error("[vendorapay-refund] PI retrieve failed", err);
      return json(404, { error: "payment not found" });
    }
    // Ownership check, fail-closed. The PI's vendor_id metadata is the
    // primary signal, but legacy / externally-created PIs may lack it —
    // and the OLD check skipped verification entirely when metadata was
    // absent, letting an admin of vendor A refund vendor B's charge by
    // passing B's PI id. So: if metadata is present it must match; if
    // it's absent, fall back to resolving the PI through our own DB
    // (a paid invoice or payment_link records paid_payment_intent_id).
    // If NEITHER confirms this vendor owns the charge, deny.
    const piVendorId = (pi.metadata?.vendor_id as string | undefined) ?? null;
    if (piVendorId) {
      if (piVendorId !== businessId) {
        return json(403, { error: "payment does not belong to this vendor" });
      }
    } else {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
      const [{ data: invMatch }, { data: linkMatch }] = await Promise.all([
        admin
          .from("invoices")
          .select("vendor_id")
          .eq("paid_payment_intent_id", paymentIntentId)
          .eq("vendor_id", businessId)
          .maybeSingle(),
        admin
          .from("payment_links")
          .select("vendor_id")
          .eq("paid_payment_intent_id", paymentIntentId)
          .eq("vendor_id", businessId)
          .maybeSingle(),
      ]);
      if (!invMatch && !linkMatch) {
        // Either the charge isn't ours to attribute, or it belongs to a
        // different vendor. Refuse rather than refund on an unverified PI.
        return json(403, { error: "payment does not belong to this vendor" });
      }
    }
    // Server-side cap: never refund more than what's left.
    // Stripe would reject too, but bouncing the request here keeps
    // the error path clean and avoids exposing Stripe error messages
    // to the frontend.
    const charge = pi.latest_charge as { amount?: number; amount_refunded?: number } | string | null;
    const chargeAmount = (typeof charge === "object" && charge ? charge.amount : null) ?? pi.amount;
    const alreadyRefunded = (typeof charge === "object" && charge ? charge.amount_refunded : 0) ?? 0;
    const refundableCents = chargeAmount - alreadyRefunded;
    if (refundableCents <= 0) {
      return json(400, { error: "payment already fully refunded" });
    }
    if (amountCents !== undefined && amountCents > refundableCents) {
      return json(400, {
        error: "refund amount exceeds remaining balance",
        max_refundable_cents: refundableCents,
      });
    }

    const refund = await client().refunds.create({
      payment_intent: paymentIntentId,
      amount: amountCents,
      reason: reason as Stripe.RefundCreateParams.Reason,
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: {
        vendor_id: businessId,
        refunded_by: userData.user.id,
      },
    });

    return json(200, {
      refund_id: refund.id,
      amount_cents: refund.amount,
      currency: refund.currency,
      status: refund.status,
    });
  } catch (err) {
    console.error("[vendorapay-refund] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: "refund_failed", detail: message.slice(0, 240) });
  }
});
