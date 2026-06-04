// VendoraPay: POST /vendorapay-fees-report { business_id, since, until }
//
// Aggregates Stripe fees (+ gross + net) for a vendor's connected
// account over an arbitrary date range. Used by the Reports surface
// in My Vendora to surface fees as a discrete line and compute
// net-to-bank for any window the vendor picks.
//
// Auth: standard Supabase JWT, gated by is_vendor_member(business_id).
// Same shape as vendorapay-status / vendorapay-transactions.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { aggregateFeesForPeriod } from "../_shared/payments.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const body = await req.json().catch(() => ({}));
    const businessId = body?.business_id as string | undefined;
    const sinceIso = body?.since as string | undefined;
    const untilIso = body?.until as string | undefined;
    if (!businessId) return json(400, { error: "business_id required" });
    if (!sinceIso || !untilIso) return json(400, { error: "since + until required" });

    const since = new Date(sinceIso);
    const until = new Date(untilIso);
    if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
      return json(400, { error: "invalid date" });
    }
    if (until <= since) {
      return json(400, { error: "until must be after since" });
    }
    // Hard cap on range — 5 years should cover any realistic
    // accounting period and prevents an open-ended "all time" call
    // from paginating thousands of pages on a heavy account.
    const fiveYearsMs = 5 * 365 * 24 * 60 * 60 * 1000;
    if (until.getTime() - since.getTime() > fiveYearsMs) {
      return json(400, { error: "range_too_wide", detail: "max 5 years per call" });
    }

    // Ownership check — caller must be on the vendor team.
    const { data: isMember } = await userClient.rpc("is_vendor_member", {
      _vendor_id: businessId,
    });
    if (!isMember) return json(403, { error: "not a team member" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    // vendor_payment_secrets is account-level (keyed by the listing
    // owner's user_id). Resolve the owner from the listing, then look up
    // by user_id — keying by vendor_id misses every post-migration vendor.
    const { data: ownerRow } = await admin
      .from("vendor_profiles")
      .select("user_id")
      .eq("id", businessId)
      .maybeSingle();
    const ownerId = (ownerRow as { user_id?: string | null } | null)?.user_id ?? null;
    const { data: secret } = ownerId
      ? await admin
          .from("vendor_payment_secrets")
          .select("stripe_account_id")
          .eq("user_id", ownerId)
          .maybeSingle()
      : { data: null };
    const stripeAccountId =
      (secret as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? null;
    if (!stripeAccountId) {
      // Not connected yet — return zeros so the UI can render
      // gracefully without a flash of error.
      return json(200, {
        fees_cents: 0,
        gross_cents: 0,
        net_cents: 0,
        currency: "usd",
        count: 0,
        connected: false,
      });
    }

    const result = await aggregateFeesForPeriod({
      account_id: stripeAccountId,
      since,
      until,
    });
    return json(200, { ...result, connected: true });
  } catch (err) {
    console.error("[vendorapay-fees-report] error", err);
    return json(500, { error: "internal" });
  }
});
