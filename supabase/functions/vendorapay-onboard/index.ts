// VendoraPay Phase 1: POST /vendorapay/onboard
//
// Creates a connected account for the logged-in business, stores
// the opaque account_id on vendor_payment_secrets (locked-down side
// table; only service_role can read), and returns a VendoraPay-
// branded onboarding link.
//
// Idempotent on a per-business basis: re-onboarding the same vendor
// reuses the existing account and just mints a fresh link.
//
// The frontend gets back { url, account_id } and redirects the
// user to the URL. After they complete KYC, Stripe redirects to
// /vendorapay/return which prompts the frontend to re-fetch
// /vendorapay/status.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  createAccount,
  createOnboardingLink,
} from "../_shared/payments.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";

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
    const userEmail = userData.user.email ?? null;

    const body = await req.json().catch(() => ({}));
    const businessId = (body?.business_id as string | undefined) ?? null;
    if (!businessId) return json(400, { error: "business_id required" });

    // Ownership check: caller must be admin on this business.
    const { data: isAdmin } = await userClient.rpc("is_vendor_team_admin", {
      _vendor_id: businessId,
    });
    if (!isAdmin) return json(403, { error: "admin role required" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Reuse the existing account if we already onboarded this vendor.
    const { data: existing } = await admin
      .from("vendor_payment_secrets")
      .select("stripe_account_id")
      .eq("vendor_id", businessId)
      .maybeSingle();
    let accountId =
      (existing as { stripe_account_id?: string | null } | null)
        ?.stripe_account_id ?? null;

    if (!accountId) {
      // Idempotency key is deterministic per business so a retry of
      // POST /vendorapay/onboard within the same request window
      // never spawns a second provider account for the same vendor.
      const account = await createAccount({
        email: userEmail,
        business_id: businessId,
        idempotency_key: `vendorapay:onboard:${businessId}`,
      });
      accountId = account.id;
      await admin.from("vendor_payment_secrets").upsert(
        {
          vendor_id: businessId,
          stripe_account_id: accountId,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
        },
        { onConflict: "vendor_id" },
      );
    }

    const { url } = await createOnboardingLink({
      account_id: accountId,
      return_url: `${APP_URL}/vendorapay/return`,
      refresh_url: `${APP_URL}/vendorapay/refresh`,
    });

    return json(200, { url, account_id: accountId });
  } catch (err) {
    console.error("[vendorapay-onboard] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, {
      error: "onboard_failed",
      detail: message.slice(0, 240),
    });
  }
});
