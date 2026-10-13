// Closes the signed-in user's account, cancelling any Stripe plan first.
//
// Before this existed, the website and both apps called the
// request_account_deletion RPC directly, which left the Stripe
// subscription running, so a vendor on Pro or Premium kept being charged
// after their account was gone.
//
// Order matters: every live Stripe subscription on the profile's customer
// is cancelled immediately (no proration, no refund: Vendora has no refund
// policy to apply), and only once that succeeds is the account closed. If
// Stripe can't be reached the account is left alone and the caller gets an
// error, so nobody ends up closed-but-still-billed.
//
// Closing = a 30-day grace period (owner's call, Oct 2026):
// request_account_deletion() sets profiles.deletion_scheduled_for 30 days
// out and pauses the user's listings. Signing in before then shows a
// restore screen. purge-deleted-accounts (daily cron) removes the user's
// files and deletes the auth user once the date passes (migration
// 20261013140000_account_deletion_grace.sql).
//
// The Stripe Customer itself is kept (invoice history for bookkeeping).
//
// Required env:
//   STRIPE_SECRET_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_ANON_KEY (for auth.getUser and the RPC via the user's JWT)
//
// Invoke from a client:
//   const { data, error } = await supabase.functions.invoke("delete-account");
//   // data: { scheduled_for: ISO timestamp of the purge }

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Subscription statuses that can still charge the customer.
const ENDED = new Set(["canceled", "incomplete_expired"]);

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "secrets_not_configured" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "missing_auth" });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return json(401, { error: "invalid_auth" });

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: profile } = await db
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();

  const customerId = profile?.stripe_customer_id as string | null | undefined;
  const subId = profile?.stripe_subscription_id as string | null | undefined;

  if (customerId || subId) {
    if (!STRIPE_SECRET_KEY) {
      return json(500, { error: "stripe_not_configured" });
    }
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });
    try {
      // Every live subscription on the customer, plus the one on the
      // profile in case it sits on a different customer.
      const ids = new Set<string>();
      if (customerId) {
        const subs = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 100,
        });
        for (const s of subs.data) if (!ENDED.has(s.status)) ids.add(s.id);
      }
      if (subId && !ids.has(subId)) {
        const s = await stripe.subscriptions.retrieve(subId).catch(() => null);
        if (s && !ENDED.has(s.status)) ids.add(s.id);
      }
      for (const id of ids) {
        await stripe.subscriptions.cancel(id, {
          invoice_now: false,
          prorate: false,
        });
      }
    } catch (e: any) {
      console.error("[delete-account] stripe cancel failed:", e?.message ?? e);
      return json(502, { error: "subscription_cancel_failed" });
    }
  }

  // Schedule the deletion, run as the user so auth.uid() resolves.
  const { data: scheduledFor, error } = await userClient.rpc(
    "request_account_deletion",
  );
  if (error) {
    console.error("[delete-account] rpc failed:", error.message);
    return json(500, { error: "delete_failed", message: error.message });
  }

  return json(200, { scheduled_for: scheduledFor ?? null });
});
