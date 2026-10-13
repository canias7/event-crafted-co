// Purges accounts whose 30-day deletion grace period is over (owner's
// call, Oct 2026). Runs daily from pg_cron (migration
// 20261013140000_account_deletion_grace.sql).
//
// account_deletions_pending() returns:
//   * due accounts (profiles.deletion_scheduled_for has passed), and
//   * scheduled, not-yet-due accounts that still carry a Stripe
//     subscription (closed from an old app build that called
//     request_account_deletion directly, skipping delete-account).
//
// For every row, any live Stripe subscription is cancelled (same rules as
// delete-account: immediately, no proration, no refund). For due rows the
// job then:
//   1. re-checks the profile is still scheduled and due (the user may have
//      restored it a moment ago),
//   2. removes every file the user owns through the Storage API
//      (account_storage_objects(): their uploads, and the folders named
//      after their user id or listing ids in the user-content buckets);
//      a direct SQL delete is blocked by storage.protect_delete,
//   3. deletes the auth user, so their rows cascade as they did when
//      deletion was immediate.
// A failure on one account is logged and the job moves on; the account
// stays scheduled and is retried on the next run. A due account whose
// Stripe cancel or file removal fails is not deleted, so nobody is
// deleted while still billed or with files left behind.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional env: STRIPE_SECRET_KEY (needed for accounts with Stripe ids).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Subscription statuses that can still charge the customer.
const ENDED = new Set(["canceled", "incomplete_expired"]);
// Rows asked for per account_storage_objects() call, and per remove().
const PAGE = 1000;
const REMOVE_BATCH = 100;

interface PendingRow {
  user_id: string;
  deletion_scheduled_for: string;
  due: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface AccountResult {
  user_id: string;
  due: boolean;
  subscriptions_cancelled: number;
  files_removed: number;
  deleted: boolean;
  error?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Same lookup as delete-account: every live subscription on the customer,
// plus the one on the profile in case it sits on a different customer.
async function cancelSubscriptions(
  stripe: Stripe,
  customerId: string | null,
  subId: string | null,
): Promise<number> {
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
  return ids.size;
}

// Removes every file account_storage_objects() lists for the user, a page
// at a time, until none are left. Throws if a page removes nothing, so a
// stuck object can't loop forever.
async function removeFiles(admin: any, userId: string): Promise<number> {
  let removed = 0;
  for (;;) {
    const { data, error } = await admin.rpc("account_storage_objects", {
      p_user_id: userId,
      p_limit: PAGE,
    });
    if (error) throw new Error(`list files: ${error.message}`);
    const rows = (data as { bucket_id: string; name: string }[] | null) ?? [];
    if (rows.length === 0) return removed;

    const byBucket = new Map<string, string[]>();
    for (const r of rows) {
      const list = byBucket.get(r.bucket_id) ?? [];
      list.push(r.name);
      byBucket.set(r.bucket_id, list);
    }
    let pageRemoved = 0;
    for (const [bucket, names] of byBucket) {
      for (let i = 0; i < names.length; i += REMOVE_BATCH) {
        const chunk = names.slice(i, i + REMOVE_BATCH);
        const { data: gone, error: rmErr } = await admin.storage
          .from(bucket)
          .remove(chunk);
        if (rmErr) throw new Error(`remove ${bucket}: ${rmErr.message}`);
        pageRemoved += (gone as unknown[] | null)?.length ?? 0;
      }
    }
    if (pageRemoved === 0) {
      throw new Error(`could not remove ${rows.length} file(s)`);
    }
    removed += pageRemoved;
  }
}

serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Supabase admin credentials not set" }, 500);
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Same shared-secret check as the other cron scanners: dormant until
  // the cron_secret exists, fails open on an RPC error.
  {
    const provided = req.headers.get("x-cron-secret") ??
      (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: ok, error } = await admin.rpc("cron_secret_ok", { provided });
    if (!error && ok === false) return json({ error: "unauthorized" }, 401);
  }

  const { data, error } = await admin.rpc("account_deletions_pending");
  if (error) return json({ error: error.message }, 500);
  const rows = (data as PendingRow[] | null) ?? [];

  const stripe = STRIPE_SECRET_KEY
    ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    })
    : null;

  const results: AccountResult[] = [];
  for (const row of rows) {
    const res: AccountResult = {
      user_id: row.user_id,
      due: row.due,
      subscriptions_cancelled: 0,
      files_removed: 0,
      deleted: false,
    };
    results.push(res);
    try {
      if (row.stripe_customer_id || row.stripe_subscription_id) {
        if (!stripe) throw new Error("STRIPE_SECRET_KEY not set");
        res.subscriptions_cancelled = await cancelSubscriptions(
          stripe,
          row.stripe_customer_id,
          row.stripe_subscription_id,
        );
      }
      if (!row.due) continue;

      // The user may have restored the account since the list was read.
      const { data: still, error: checkErr } = await admin
        .from("profiles")
        .select("deletion_scheduled_for")
        .eq("id", row.user_id)
        .maybeSingle();
      if (checkErr) throw new Error(`re-check: ${checkErr.message}`);
      const when = still?.deletion_scheduled_for as string | null | undefined;
      if (!when || new Date(when).getTime() > Date.now()) {
        res.error = "restored";
        continue;
      }

      res.files_removed = await removeFiles(admin, row.user_id);

      const { error: delErr } = await admin.auth.admin.deleteUser(row.user_id);
      if (delErr) throw new Error(`delete user: ${delErr.message}`);
      res.deleted = true;
    } catch (e: any) {
      res.error = String(e?.message ?? e);
      console.error(`[purge-deleted-accounts] ${row.user_id}:`, res.error);
    }
  }

  const summary = {
    ok: true,
    checked: rows.length,
    deleted: results.filter((r) => r.deleted).length,
    subscriptions_cancelled: results.reduce(
      (n, r) => n + r.subscriptions_cancelled,
      0,
    ),
    files_removed: results.reduce((n, r) => n + r.files_removed, 0),
    failed: results.filter((r) => r.error && r.error !== "restored").length,
    results,
  };
  console.log(
    `[purge-deleted-accounts] checked=${summary.checked} deleted=${summary.deleted} ` +
      `subs=${summary.subscriptions_cancelled} files=${summary.files_removed} failed=${summary.failed}`,
  );
  return json(summary);
});
