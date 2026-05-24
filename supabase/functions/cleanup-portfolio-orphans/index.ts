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

  // RPC returns an array of orphan storage paths. Older-than
  // window comes from the SQL function's default (60 minutes); we
  // could pass an override here if we ever want to be more
  // aggressive but the default is the right safety margin.
  const { data, error } = await supabase.rpc("find_portfolio_orphans");
  if (error) {
    return new Response(
      JSON.stringify({ error: "rpc_failed", detail: error.message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const orphans = (data ?? []) as string[] | null;
  if (!orphans || orphans.length === 0) {
    return new Response(JSON.stringify({ deleted: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  // storage.remove takes an array of paths; batch into chunks so a
  // single big sweep doesn't hit any unstated per-request cap.
  let deleted = 0;
  const errors: string[] = [];
  for (let i = 0; i < orphans.length; i += REMOVE_BATCH_SIZE) {
    const batch = orphans.slice(i, i + REMOVE_BATCH_SIZE);
    const { error: rmErr } = await supabase.storage
      .from("vendor-portfolios")
      .remove(batch);
    if (rmErr) {
      errors.push(rmErr.message);
      continue;
    }
    deleted += batch.length;
  }

  return new Response(
    JSON.stringify({
      deleted,
      scanned: orphans.length,
      errors: errors.length > 0 ? errors : undefined,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
