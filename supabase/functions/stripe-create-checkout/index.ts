// Creates a Stripe Checkout Session for a proposal payment. Uses
// destination charges + application_fee_amount so funds settle on
// the vendor's connected account and the platform collects its cut
// in one operation.
//
// Required env:
//   STRIPE_SECRET_KEY                  — sk_test_... or sk_live_...
//   STRIPE_PLATFORM_FEE_BASIS_POINTS   — integer, default 500 (5%)
//   APP_URL                            — base URL of the web app
//
// Invoke from frontend (host paying for an accepted proposal):
//   const { data } = await supabase.functions.invoke("stripe-create-checkout", {
//     body: { proposal_id, mode: "deposit" | "full" }
//   });
//   window.location.href = data.url;

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const PLATFORM_FEE_BPS = Number(
  Deno.env.get("STRIPE_PLATFORM_FEE_BASIS_POINTS") ?? "500",
);
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Stripe/Supabase secrets not configured" }, 500);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing auth" }, 401);

  const userClient = createClient(
    SUPABASE_URL!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return json({ error: "invalid auth" }, 401);

  const body = await req.json().catch(() => ({}));
  const proposalId = body?.proposal_id as string | undefined;
  const mode = (body?.mode as string | undefined) ?? "full";
  if (!proposalId) return json({ error: "proposal_id required" }, 400);
  if (mode !== "deposit" && mode !== "full") {
    return json({ error: "mode must be 'deposit' or 'full'" }, 400);
  }

  // Read the proposal under the caller's RLS — this validates
  // ownership (only the host on the inquiry can pay).
  const { data: proposal, error: pErr } = await userClient
    .from("proposals")
    .select(
      "id, host_id, vendor_id, title, subtotal_cents, deposit_cents, payment_status, status, vendor:vendor_profiles!proposals_vendor_id_fkey(business_name)",
    )
    .eq("id", proposalId)
    .maybeSingle();

  if (pErr || !proposal) {
    return json({ error: "proposal not found" }, 404);
  }
  if (proposal.host_id !== userId) {
    return json({ error: "only the host can pay this proposal" }, 403);
  }
  if (proposal.status !== "accepted") {
    return json({ error: "proposal must be accepted before payment" }, 400);
  }
  if (proposal.payment_status === "paid_in_full") {
    return json({ error: "proposal already paid in full" }, 400);
  }

  // stripe_account_id moved to vendor_payment_secrets (audit PR #883).
  // It's RLS-locked from clients; we use service_role to read.
  const dbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: secret } = await dbAdmin
    .from("vendor_payment_secrets")
    .select("stripe_account_id, charges_enabled")
    .eq("vendor_id", proposal.vendor_id)
    .maybeSingle();
  const secretRow = secret as
    | { stripe_account_id?: string | null; charges_enabled?: boolean | null }
    | null;
  const stripeAccountId = secretRow?.stripe_account_id ?? null;
  // Gate on charges_enabled (set by the account.updated webhook).
  // stripe_account_id alone just means "vendor clicked Connect" —
  // KYC may still be pending, and Stripe will reject the checkout
  // session creation with a confusing 400 if charges aren't enabled.
  if (!stripeAccountId || !secretRow?.charges_enabled) {
    return json(
      { error: "vendor has not finished Stripe onboarding" },
      400,
    );
  }

  const amountCents =
    mode === "deposit"
      ? (proposal.deposit_cents ?? 0)
      : proposal.subtotal_cents -
        (proposal.payment_status === "deposit_paid"
          ? (proposal.deposit_cents ?? 0)
          : 0);
  if (amountCents <= 0) {
    return json({ error: "nothing to charge" }, 400);
  }

  // Application fee is charged on the GROSS amount being processed
  // here. Stripe rounds to integer cents.
  const applicationFeeCents = Math.round(
    (amountCents * PLATFORM_FEE_BPS) / 10_000,
  );

  // Persist the session via webhook on completion — for now we just
  // record the placeholder so the row can be correlated when the
  // webhook fires.
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name:
                mode === "deposit"
                  ? `${proposal.title} — deposit`
                  : `${proposal.title} — balance`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: { destination: stripeAccountId },
        metadata: {
          proposal_id: proposal.id,
          mode,
        },
      },
      metadata: {
        proposal_id: proposal.id,
        mode,
      },
      success_url: `${APP_URL}/customer/inquiries?paid=1`,
      cancel_url: `${APP_URL}/customer/inquiries?cancelled=1`,
    },
  );

  // Best-effort: stamp the session id so the proposal row links to
  // the in-flight checkout. The webhook is what actually flips
  // payment_status — this is just a debug correlation.
  const adminDb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  await adminDb
    .from("proposals")
    .update({
      stripe_checkout_session_id: session.id,
      application_fee_cents: applicationFeeCents,
    })
    .eq("id", proposal.id);

  return json({ url: session.url, session_id: session.id });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
