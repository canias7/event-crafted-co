// VendoraPay: POST /vendorapay-link-checkout { slug }
//
// Public endpoint (no auth) that takes a pay-link slug, creates a
// Stripe Checkout Session with the vendor as the destination, and
// returns the Stripe-hosted URL. The page redirects the host there.
//
// Vendor's tier sets the application_fee_amount (see _shared/platformFees.ts).
// metadata.payment_link_id lets the webhook mark the link paid on
// payment_intent.succeeded.

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const body = await req.json().catch(() => ({}));
    const slug = (body?.slug as string | undefined)?.trim();
    if (!slug) return json(400, { error: "slug required" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Rate limit per pay-link slug before any live Stripe calls. Fail open:
    // a limiter error / null result must NOT block legitimate buyers.
    const { data: allowed } = await admin.rpc("bump_rate_limit", {
      _bucket: `vendorapay-link-checkout:${slug}`,
      _max: 30,
      _window_seconds: 60,
    });
    if (allowed === false) return json(429, { error: "rate_limited" });

    // Also bound per client IP across ALL slugs, so iterating many valid
    // slugs can't drive unbounded Stripe session creation. Fail open.
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const { data: ipAllowed } = await admin.rpc("bump_rate_limit", {
      _bucket: `vendorapay-link-checkout-ip:${ip}`,
      _max: 60,
      _window_seconds: 60,
    });
    if (ipAllowed === false) return json(429, { error: "rate_limited" });

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

    // vendor_payment_secrets is keyed by the listing OWNER's user_id
    // (account-level since the secrets migration), so resolve the owner
    // from the listing first. Looking the secret up by vendor_id silently
    // fails for every vendor onboarded after that migration.
    const { data: vp } = await admin
      .from("vendor_profiles")
      .select("user_id, business_name")
      .eq("id", linkRow.vendor_id)
      .maybeSingle();
    const vpRow = vp as { user_id?: string | null; business_name?: string | null } | null;
    if (!vpRow?.user_id) {
      return json(400, { error: "vendor not ready to receive payments" });
    }
    const { data: secret } = await admin
      .from("vendor_payment_secrets")
      .select("stripe_account_id, charges_enabled")
      .eq("user_id", vpRow.user_id)
      .maybeSingle();
    const sRow = secret as { stripe_account_id?: string | null; charges_enabled?: boolean | null } | null;
    if (!sRow?.stripe_account_id) {
      return json(400, { error: "vendor not ready to receive payments" });
    }
    // Cached charges_enabled can be stale if account.updated webhook
    // didn't fire (e.g. account got locked by Stripe). Re-verify live
    // and refresh the cache before minting a checkout session — money
    // would otherwise sit in platform funds limbo on a dead account.
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
      console.error("[vendorapay-link-checkout] account verify failed", err);
    }
    if (!charges_live) {
      return json(400, { error: "vendor not ready to receive payments" });
    }

    // vpRow (business_name + user_id) already resolved above.
    // Snapshot tier captured at link creation (trigger). Falls back
    // to live tier for legacy rows without the snapshot. This means
    // a vendor changing plans AFTER sharing the link doesn't change
    // the fee the host pays.
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
    const feeCents = computePlatformFeeCents(tier, linkRow.amount_cents as number);

    const session = await client().checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: (linkRow.currency as string) ?? "usd",
          unit_amount: linkRow.amount_cents as number,
          product_data: {
            name: linkRow.title as string,
            description: (linkRow.description as string | null) ?? undefined,
          },
        },
      }],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination: sRow.stripe_account_id },
        statement_descriptor: "VENDORAPAY",
        description: `${vpRow?.business_name ?? "VendoraPay"} — ${linkRow.title}`,
        metadata: {
          payment_link_id: linkRow.id as string,
          vendor_id: linkRow.vendor_id as string,
          vendor_tier: tier,
        },
      },
      metadata: {
        payment_link_id: linkRow.id as string,
        vendor_id: linkRow.vendor_id as string,
      },
      success_url: `${APP_URL}/pay/link/${slug}?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pay/link/${slug}?status=cancelled`,
    });

    return json(200, { url: session.url });
  } catch (err) {
    console.error("[vendorapay-link-checkout] error", err);
    // Don't surface provider-internal error text to the public client.
    return json(500, { error: "checkout_failed" });
  }
});
