// Hourly sweep that removes storage objects in vendor-portfolios
// that have no matching row in vendor_portfolio_images and were
// created more than ~1 hour ago.
//
// Why this exists: the listing wizard and edit modal upload photos
// to storage BEFORE inserting their DB rows (so we can use the
// final storage path in the insert). If the vendor closes the
// browser tab mid-upload, our rollback path never runs and we're
// left with orphan storage objects with no DB tracking. Per-modal
// cancellation (PR #844) handles the "click X" case; this scan
// handles the "kill the tab" / "lose connection" case.
//
// The 1-hour age cutoff protects against deleting in-flight
// uploads. A vendor picking 100 photos shouldn't trigger any
// deletions because the row insert lands within seconds of the
// upload — anything older than an hour without a row is almost
// certainly garbage.
//
// Auth: verify_jwt is false. Fires from pg_cron via net.http_post
// with no Supabase JWT. The function uses the service role key
// from env to do the SQL + storage.remove work.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const REMOVE_BATCH_SIZE = 100;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // RPC #1: orphan STORAGE objects in vendor-portfolios. Older-
  // than window comes from the SQL function's default (60 min);
  // good safety margin against catching active uploads.
  const { data: storageData, error: storageErr } = await supabase.rpc(
    "find_portfolio_orphans",
  );
  if (storageErr) {
    return new Response(
      JSON.stringify({ error: "rpc_failed", detail: storageErr.message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const orphanPaths = (storageData ?? []) as string[];

  // RPC #2: orphan DRAFT vendor_profiles rows with 0 photos. The
  // wizard creates rows as 'draft' and only flips to 'pending'
  // after photos + FAQs commit. A draft with 0 photos older than
  // 1 hour means the vendor closed the tab mid-submit.
  const { data: listingData, error: listingErr } = await supabase.rpc(
    "find_orphan_draft_listings",
  );
  if (listingErr) {
    return new Response(
      JSON.stringify({ error: "rpc_failed", detail: listingErr.message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const orphanListingIds = (listingData ?? []) as string[];

  // Storage cleanup: batch storage.remove since the single-request
  // cap is unspecified.
  let storageDeleted = 0;
  const errors: string[] = [];
  for (let i = 0; i < orphanPaths.length; i += REMOVE_BATCH_SIZE) {
    const batch = orphanPaths.slice(i, i + REMOVE_BATCH_SIZE);
    const { error: rmErr } = await supabase.storage
      .from("vendor-portfolios")
      .remove(batch);
    if (rmErr) {
      errors.push(`storage: ${rmErr.message}`);
      continue;
    }
    storageDeleted += batch.length;
  }

  // Listing cleanup: a single DELETE handles all of them. RLS
  // bypassed via service role; the find_orphan_draft_listings RPC
  // already enforced the safety filters (status=draft, no photos,
  // >1h old).
  let listingsDeleted = 0;
  if (orphanListingIds.length > 0) {
    const { error: delErr, count } = await supabase
      .from("vendor_profiles")
      .delete({ count: "exact" })
      .in("id", orphanListingIds);
    if (delErr) {
      errors.push(`listings: ${delErr.message}`);
    } else {
      listingsDeleted = count ?? orphanListingIds.length;
    }
  }

  return new Response(
    JSON.stringify({
      storage_deleted: storageDeleted,
      storage_scanned: orphanPaths.length,
      listings_deleted: listingsDeleted,
      listings_scanned: orphanListingIds.length,
      errors: errors.length > 0 ? errors : undefined,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
