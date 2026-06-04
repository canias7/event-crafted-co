// VendoraPay Phase 1: POST /vendorapay/charge
//
// Creates a PaymentIntent on the destination connected account with
// VendoraPay's platform fee taken off the top. Returns a
// client_secret the frontend uses to confirm the payment in our
// own React UI (Stripe Elements rendered inside the Vendora app —
// no Stripe-hosted page).
//
// Caller passes an idempotency_key (client-generated UUID) so a
// double-click on Pay can't double-charge. Same key + same payload
// = same PaymentIntent returned.
//
// Currently scoped to proposal payments: caller must be the host on
// the proposal, the proposal must be 'accepted', amount must match
// the proposal's outstanding balance.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { charge } from "../_shared/payments.ts";
import { computePlatformFeeCents, normalizeTier } from "../_shared/platformFees.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const userId = userData.user.id;
    const userEmail = userData.user.email ?? undefined;

    const body = await req.json().catch(() => ({}));
    const proposalId = body?.proposal_id as string | undefined;
    const mode = ((body?.mode as string | undefined) ?? "full") as
      | "full"
      | "deposit";
    const idempotencyKey = body?.idempotency_key as string | undefined;
    if (!proposalId) return json(400, { error: "proposal_id required" });
    if (!idempotencyKey) {
      return json(400, { error: "idempotency_key required" });
    }
    if (mode !== "full" && mode !== "deposit") {
      return json(400, { error: "mode must be full or deposit" });
    }

    // Read the proposal under the caller's RLS — validates the host
    // owns it AND gives us amount + vendor_id in one query.
    const { data: proposal, error: pErr } = await userClient
      .from("proposals")
      .select(
        "id, host_id, vendor_id, title, subtotal_cents, deposit_cents, payment_status, status",
      )
      .eq("id", proposalId)
      .maybeSingle();
    if (pErr || !proposal) return json(404, { error: "proposal not found" });
    if (proposal.host_id !== userId) {
      return json(403, { error: "only the host can pay this proposal" });
    }
    if (proposal.status !== "accepted") {
      return json(400, { error: "proposal must be accepted before payment" });
    }
    if (proposal.payment_status === "paid_in_full") {
      return json(400, { error: "proposal already paid in full" });
    }
    // Block a second deposit charge once the deposit has cleared. The
    // host should be in "pay balance" mode at that point — calling
    // /charge with mode=deposit when payment_status is already
    // deposit_paid would charge the deposit twice.
    if (mode === "deposit" && proposal.payment_status === "deposit_paid") {
      return json(400, { error: "deposit already paid" });
    }

    // Source vendor's connected account via the locked-down secrets
    // table (service_role only).
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    // vendor_payment_secrets is account-level (keyed by the listing owner's
    // user_id since the secrets migration). Resolve the owner from the
    // listing first — keying by vendor_id misses every post-migration vendor.
    const { data: ownerRow } = await admin
      .from("vendor_profiles")
      .select("user_id")
      .eq("id", proposal.vendor_id)
      .maybeSingle();
    const ownerId = (ownerRow as { user_id?: string | null } | null)?.user_id ?? null;
    const { data: secret } = ownerId
      ? await admin
          .from("vendor_payment_secrets")
          .select("stripe_account_id, charges_enabled")
          .eq("user_id", ownerId)
          .maybeSingle()
      : { data: null };
    const sRow = secret as
      | { stripe_account_id?: string | null; charges_enabled?: boolean | null }
      | null;
    if (!sRow?.stripe_account_id || !sRow.charges_enabled) {
      return json(400, { error: "vendor not ready to receive payments" });
    }

    // Recompute server-side. Never trust client-supplied amount.
    const amountCents =
      mode === "deposit"
        ? (proposal.deposit_cents ?? 0)
        : (proposal.subtotal_cents ?? 0) -
          (proposal.payment_status === "deposit_paid"
            ? (proposal.deposit_cents ?? 0)
            : 0);
    if (amountCents < 50) return json(400, { error: "amount too small" });

    // Look up the vendor's subscription tier via the RPC that joins
    // vendor_profiles -> profiles. (subscription_tier lives on
    // profiles per migration 20260524000000; the old vendor_profiles
    // column is stale.)
    const { data: tierRaw } = await admin.rpc("get_vendor_subscription_tier", {
      p_vendor_id: proposal.vendor_id,
    });
    const tier = normalizeTier(tierRaw as string | null);
    const applicationFeeCents = computePlatformFeeCents(tier, amountCents);

    const result = await charge({
      account_id: sRow.stripe_account_id,
      amount_cents: amountCents,
      currency: "usd",
      customer_email: userEmail,
      description:
        mode === "deposit"
          ? `${proposal.title} — deposit`
          : `${proposal.title} — balance`,
      metadata: {
        proposal_id: proposal.id,
        mode,
        host_id: proposal.host_id,
        vendor_id: proposal.vendor_id,
        vendor_tier: tier,
      },
      idempotency_key: idempotencyKey,
      application_fee_cents: applicationFeeCents,
    });

    // Stamp the proposal so we can correlate the webhook later.
    await admin
      .from("proposals")
      .update({ stripe_checkout_session_id: result.id })
      .eq("id", proposal.id);

    return json(200, {
      payment_intent_id: result.id,
      client_secret: result.client_secret,
      status: result.status,
      amount_cents: result.amount_cents,
      currency: result.currency,
    });
  } catch (err) {
    console.error("[vendorapay-charge] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, {
      error: "charge_failed",
      detail: message.slice(0, 240),
    });
  }
});
