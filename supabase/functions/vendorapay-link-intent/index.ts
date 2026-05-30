// VendoraPay: POST /vendorapay-link-intent { slug }
//
// Public endpoint (no auth) for the CUSTOM (embedded) pay-link checkout.
// Mirrors vendorapay-link-checkout's money logic exactly, but instead of
// a Stripe-hosted Checkout Session it creates a PaymentIntent and returns
// its client_secret + the platform publishable key so the host can pay on
// our own branded page via Stripe's Payment Element.
//
// Destination charge: funds settle on the vendor's connected account,
// platform fee (tier-based) taken via application_fee_amount. The SAME
// metadata.payment_link_id is set so vendorapay-webhook marks the link
// paid on payment_intent.succeeded — no webhook change needed.
//
// Idempotent per slug: passes idempotencyKey so a host refreshing the
// page reuses the same PaymentIntent instead of creating duplicates.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { computePlatformFeeCents, normalizeTier } from "../_shared/platformFees.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
// Publishable key is safe to expose to the browser. Returned to the
// client so the Payment Element can initialize. Falls back to deriving
// nothing — if unset, the client should use hosted checkout instead.
const STRIPE_PUBLISHABLE_KEY = Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    // No publishable key configured → tell the client to use hosted
    // checkout. Keeps the embedded path strictly additive.
    if (!STRIPE_PUBLISHABLE_KEY) {
      return json(200, { use_hosted: true });
    }

    const body = await req.json().catch(() => ({}));
    const slug = (body?.slug as string | undefined)?.trim();
    if (!slug) return json(400, { error: "slug required" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: linkRow, error: linkErr } = await admin
      .from("payment_links")
      .select("id, vendor_id, title, description, amount_cents, currency, status, expires_at, vendor_tier_snapshot")
      .eq("slug", slug)
      .maybeSingle();
    if (linkErr || !linkRow) return json(404, { error: "link not found" });
    if (linkRow.status !== "active") return json(400, { error: `link is ${linkRow.status}` });
    if (linkRow.expires_at && new Date(linkRow.expires_at as string) < new Date()) {
      return json(400, { error: "link expired" });
    }

    const { data: secret } = await admin
      .from("vendor_payment_secrets")
      .select("stripe_account_id, charges_enabled")
      .eq("vendor_id", linkRow.vendor_id)
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
      console.error("[vendorapay-link-intent] account verify failed", err);
    }
    if (!charges_live) {
      return json(400, { error: "vendor not ready to receive payments" });
    }

    const { data: vp } = await admin
      .from("vendor_profiles")
      .select("business_name")
      .eq("id", linkRow.vendor_id)
      .maybeSingle();
    const vpRow = vp as { business_name?: string | null } | null;
    // Snapshot tier captured at link creation; fall back to live tier.
    const snapshotTier = (linkRow as { vendor_tier_snapshot?: string | null }).vendor_tier_snapshot;
    let tier;
    if (snapshotTier) {
      tier = normalizeTier(snapshotTier);
    } else {
      const { data: tierRaw } = await admin.rpc("get_vendor_subscription_tier", {
        p_vendor_id: linkRow.vendor_id,
      });
      tier = normalizeTier(tierRaw as string | null);
    }
    const amountCents = linkRow.amount_cents as number;
    const currency = (linkRow.currency as string) ?? "usd";
    const feeCents = computePlatformFeeCents(tier, amountCents);

    // Destination charge as a PaymentIntent (same shape Checkout used).
    // automatic_payment_methods → Payment Element renders card + wallets
    // the account supports. Idempotency keyed by slug so a page refresh
    // reuses the intent instead of creating duplicates.
    const intent = await client().paymentIntents.create(
      {
        amount: amountCents,
        currency,
        // deno-lint-ignore no-explicit-any
        automatic_payment_methods: { enabled: true } as any,
        application_fee_amount: feeCents,
        transfer_data: { destination: sRow.stripe_account_id },
        description: `${vpRow?.business_name ?? "VendoraPay"} — ${linkRow.title}`,
        metadata: {
          payment_link_id: linkRow.id as string,
          vendor_id: linkRow.vendor_id as string,
          vendor_tier: tier,
        },
      },
      { idempotencyKey: `paylink_intent_${linkRow.id}` },
    );

    return json(200, {
      use_hosted: false,
      client_secret: intent.client_secret,
      publishable_key: STRIPE_PUBLISHABLE_KEY,
      amount_cents: amountCents,
      currency,
      title: linkRow.title,
      description: linkRow.description ?? null,
      business_name: vpRow?.business_name ?? null,
    });
  } catch (err) {
    console.error("[vendorapay-link-intent] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: "intent_failed", detail: message.slice(0, 240) });
  }
});
