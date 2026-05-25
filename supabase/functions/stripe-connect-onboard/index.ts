// Stripe Connect Express onboarding. Creates a Stripe-hosted account
// + Account Link the vendor uses to complete KYC. Idempotent on the
// account creation — if the vendor already has a stripe_account_id
// we just mint a fresh onboarding link against it.
//
// Required env (Supabase Edge Function secrets):
//   STRIPE_SECRET_KEY          — sk_test_... or sk_live_...
//   APP_URL                    — base URL of the web app (return/refresh URLs)
//   SUPABASE_URL               — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  — auto-injected
//
// Invoke from frontend:
//   const { data } = await supabase.functions.invoke("stripe-connect-onboard", {
//     body: { vendor_id }
//   });
//   if (data?.url) window.location.href = data.url;

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const APP_URL =
  Deno.env.get("APP_URL") ?? "https://eventvendora.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function admin() {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

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

  // Auth check: the caller's JWT lets us identify the user. We use
  // the user-scoped client (anon key + Authorization header) so RLS
  // applies and is_vendor_team_admin sees the right uid. The
  // service-role client is used afterwards for writes that bypass
  // RLS (storing stripe_account_id even if read policies wouldn't
  // surface it to the caller).
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
  const vendorId = body?.vendor_id as string | undefined;
  if (!vendorId) return json({ error: "vendor_id required" }, 400);

  // Admin role required — connecting a payout destination is a
  // financial action, not something a regular team member should do
  // on the org's behalf. The RPC is SECURITY DEFINER and reads the
  // caller's auth.uid() via the user JWT.
  const { data: isAdmin } = await userClient.rpc("is_vendor_team_admin", {
    _vendor_id: vendorId,
  });
  if (!isAdmin) {
    return json({ error: "vendor admin role required" }, 403);
  }

  // Look up the existing connected account (if any) plus profile
  // metadata we'll pre-fill on first create. service-role client
  // bypasses RLS so we always get the row.
  //
  // stripe_account_id moved out of vendor_profiles into the
  // vendor_payment_secrets side table in PR #883 (audit follow-up).
  const db = admin();
  const { data: vendor } = await db
    .from("vendor_profiles")
    .select("id, business_name, user_id")
    .eq("id", vendorId)
    .maybeSingle();

  if (!vendor) return json({ error: "vendor not found" }, 404);

  const { data: secret } = await db
    .from("vendor_payment_secrets")
    .select("stripe_account_id")
    .eq("vendor_id", vendorId)
    .maybeSingle();
  let accountId = (secret?.stripe_account_id as string | null) ?? null;

  if (!accountId) {
    // Pull the owner's email for prefill. Best-effort — the Stripe
    // onboarding form will collect it again if missing.
    const { data: owner } = await db.auth.admin.getUserById(vendor.user_id);
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: owner?.user?.email ?? undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: "individual",
      metadata: { vendor_id: vendorId },
    });
    accountId = account.id;
    // Stamp the initial state from the create response so we don't
    // have to wait for the first account.updated webhook (will be
    // all-false for a fresh account anyway, but keeps the row
    // consistent).
    await db
      .from("vendor_payment_secrets")
      .upsert(
        {
          vendor_id: vendorId,
          stripe_account_id: accountId,
          charges_enabled: Boolean(account.charges_enabled),
          payouts_enabled: Boolean(account.payouts_enabled),
          details_submitted: Boolean(account.details_submitted),
        },
        { onConflict: "vendor_id" },
      );
  } else {
    // Existing account — sync state from Stripe. This is the
    // self-healing backfill for vendors who connected before the
    // account.updated webhook was wired up (PR #884), or for any
    // case where the webhook missed an event.
    try {
      const account = await stripe.accounts.retrieve(accountId);
      await db
        .from("vendor_payment_secrets")
        .update({
          charges_enabled: Boolean(account.charges_enabled),
          payouts_enabled: Boolean(account.payouts_enabled),
          details_submitted: Boolean(account.details_submitted),
          updated_at: new Date().toISOString(),
        })
        .eq("vendor_id", vendorId);
    } catch (err) {
      // Don't fail the onboard flow over a sync error — the vendor
      // still wants their fresh onboarding link.
      console.error("[stripe-connect-onboard] sync failed", err);
    }
  }

  // Account Link is the time-bound URL the vendor opens to complete
  // onboarding. We always mint a fresh one — they expire in a few
  // minutes and Stripe explicitly recommends not caching.
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${APP_URL}/vendor/pay?stripe=refresh`,
    return_url: `${APP_URL}/vendor/pay?stripe=return`,
    type: "account_onboarding",
  });

  return json({ url: link.url, account_id: accountId });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
