// VendoraPay: POST /vendorapay/onboard
//
// Creates ONE connected account per signed-in user (account-level —
// NOT per listing) and returns a VendoraPay-branded onboarding link.
// The opaque account_id is stored on vendor_payment_secrets keyed by
// user_id (locked-down side table; only service_role can read).
//
// Idempotent per user: re-onboarding reuses the existing account and
// just mints a fresh link. No vendor_profile / listing is created —
// connecting payments is independent of publishing a listing.
//
// The frontend gets back { url, account_id } and redirects the user
// to the URL. After KYC, Stripe redirects to
// /vendor/integrations?vendorapay=return (the page re-pulls status);
// ?vendorapay=refresh handles an expired link.

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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Account-level: one Stripe connection per user. Reuse the existing
    // account if this user already has one; otherwise create it.
    const { data: existing } = await admin
      .from("vendor_payment_secrets")
      .select("id, stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle();
    let accountId =
      (existing as { stripe_account_id?: string | null } | null)
        ?.stripe_account_id ?? null;

    if (!accountId) {
      // Idempotency key is deterministic per user so a retry within the
      // same request window never spawns a second provider account.
      const account = await createAccount({
        email: userEmail,
        business_id: userId,
        idempotency_key: `vendorapay:onboard:${userId}`,
      });
      accountId = account.id;
      const existingId = (existing as { id?: string } | null)?.id ?? null;
      if (existingId) {
        await admin
          .from("vendor_payment_secrets")
          .update({
            stripe_account_id: accountId,
            charges_enabled: account.charges_enabled,
            payouts_enabled: account.payouts_enabled,
            details_submitted: account.details_submitted,
          })
          .eq("id", existingId);
      } else {
        // Upsert (not insert) so two concurrent onboard calls — which both
        // saw existing=null and got the SAME Stripe account back via the
        // idempotency key — don't make the second one fail on the user_id
        // unique index (23505). The conflicting row already has the right
        // account id, so on-conflict-update is a safe no-op-ish write.
        await admin.from("vendor_payment_secrets").upsert({
          user_id: userId,
          stripe_account_id: accountId,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
        }, { onConflict: "user_id" });
      }
    }

    const { url } = await createOnboardingLink({
      account_id: accountId,
      return_url: `${APP_URL}/vendor/integrations?vendorapay=return`,
      refresh_url: `${APP_URL}/vendor/integrations?vendorapay=refresh`,
    });

    return json(200, { url, account_id: accountId });
  } catch (err) {
    console.error("[vendorapay-onboard] error", err);
    return json(500, { error: "onboard_failed" });
  }
});

