// VendoraPay Phase 1: GET /vendorapay/status
//
// Returns onboarding completion state for a business — charges_
// enabled + payouts_enabled. The frontend polls this after the
// vendor returns from onboarding to know when "Pay" buttons can
// light up.
//
// On every call we ALSO re-sync the cached bools from the provider,
// so a vendor who completes KYC and the account.updated webhook
// missed (or hasn't fired yet) still gets the freshest state.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { getAccountStatus } from "../_shared/payments.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "unauthorized" });
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Account-level: the VendoraPay connection belongs to the user, not
    // a listing, so resolve the secret by user_id. (business_id is no
    // longer required; older callers may still send it — we ignore it.)
    const { data: secret } = await admin
      .from("vendor_payment_secrets")
      .select("id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted")
      .eq("user_id", userId)
      .maybeSingle();
    const row = secret as
      | {
          id?: string;
          stripe_account_id?: string | null;
          charges_enabled?: boolean | null;
          payouts_enabled?: boolean | null;
          details_submitted?: boolean | null;
        }
      | null;

    if (!row?.stripe_account_id) {
      return json(200, {
        onboarded: false,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      });
    }

    // Refresh from the provider. Cheap call; cached bools become
    // stale if account.updated didn't land.
    try {
      const fresh = await getAccountStatus(row.stripe_account_id);
      if (
        fresh.charges_enabled !== row.charges_enabled ||
        fresh.payouts_enabled !== row.payouts_enabled ||
        fresh.details_submitted !== row.details_submitted
      ) {
        await admin
          .from("vendor_payment_secrets")
          .update({
            charges_enabled: fresh.charges_enabled,
            payouts_enabled: fresh.payouts_enabled,
            details_submitted: fresh.details_submitted,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
      return json(200, {
        onboarded: true,
        charges_enabled: fresh.charges_enabled,
        payouts_enabled: fresh.payouts_enabled,
        details_submitted: fresh.details_submitted,
        bank: fresh.bank ?? null,
      });
    } catch (err) {
      console.error("[vendorapay-status] provider sync failed", err);
      // Fall through to the cached values so we don't fail the
      // status check on a transient provider error.
      return json(200, {
        onboarded: true,
        charges_enabled: Boolean(row.charges_enabled),
        payouts_enabled: Boolean(row.payouts_enabled),
        details_submitted: Boolean(row.details_submitted),
        bank: null,
      });
    }
  } catch (err) {
    console.error("[vendorapay-status] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, {
      error: "status_failed",
      detail: message.slice(0, 240),
    });
  }
});
