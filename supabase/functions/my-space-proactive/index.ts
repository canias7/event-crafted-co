// Proactive nudge worker for My Space. Cron-invoked daily.
//
// Scans for vendors whose attention is needed and inserts a single
// notification of type='my_space_proactive' linking back to My Space
// where the vendor can ask the AI to draft replies, etc.
//
// What we flag:
//   1) Inquiries in status='new' with no vendor reply, > 4 hours old
//   2) Hot leads (inquiry_scores.lead_score='hot') not touched in
//      the last 24 hours
//
// Throttling: we look at the notifications table — if the vendor
// already received a my_space_proactive notification in the last 20
// hours, skip them. Keeps the inbox quiet even if cron runs more
// often.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface VendorRow {
  vendor_id: string;
  user_id: string;
  business_name: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date();
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60_000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60_000)
    .toISOString();

  // 1) Find vendors with new inquiries > 4 hours old.
  const { data: staleInq } = await admin
    .from("inquiries")
    .select("vendor_id, id")
    .eq("status", "new")
    .lt("created_at", fourHoursAgo);

  // 2) Find vendors with hot leads not touched in the last day.
  // (We approximate "touched" by inquiries.last_message_at; if null,
  // use created_at.)
  const { data: hotInq } = await admin
    .from("inquiry_scores")
    .select(
      "inquiry_id, inquiries!inner(id, vendor_id, last_message_at, created_at)",
    )
    .eq("lead_score", "hot");

  // Aggregate per-vendor counts.
  const perVendor = new Map<
    string,
    { stale: number; hot: number }
  >();
  for (const row of (staleInq ?? []) as Array<any>) {
    if (!row.vendor_id) continue;
    const v = perVendor.get(row.vendor_id) ?? { stale: 0, hot: 0 };
    v.stale += 1;
    perVendor.set(row.vendor_id, v);
  }
  for (const row of (hotInq ?? []) as Array<any>) {
    const inq = row.inquiries ?? {};
    const last = inq.last_message_at ?? inq.created_at ?? null;
    if (!inq.vendor_id) continue;
    if (last && last >= oneDayAgo) continue; // touched recently
    const v = perVendor.get(inq.vendor_id) ?? { stale: 0, hot: 0 };
    v.hot += 1;
    perVendor.set(inq.vendor_id, v);
  }

  if (perVendor.size === 0) {
    return new Response(JSON.stringify({ nudged: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Resolve owner user_ids for these vendors.
  const vendorIds = Array.from(perVendor.keys());
  const { data: vendors } = await admin
    .from("vendor_profiles")
    .select("id, user_id, business_name")
    .in("id", vendorIds);

  const rows: VendorRow[] = ((vendors ?? []) as Array<any>)
    .filter((v) => v.user_id)
    .map((v) => ({
      vendor_id: v.id,
      user_id: v.user_id,
      business_name: v.business_name,
    }));
  if (rows.length === 0) {
    return new Response(JSON.stringify({ nudged: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Filter out vendors who already got a my_space_proactive
  // notification in the last 20h.
  const userIds = rows.map((r) => r.user_id);
  const { data: recentNotifs } = await admin
    .from("notifications")
    .select("user_id")
    .in("user_id", userIds)
    .eq("type", "my_space_proactive")
    .gte("created_at", twentyHoursAgo);
  const recentlyNotified = new Set(
    ((recentNotifs ?? []) as Array<any>).map((n) => n.user_id),
  );

  let nudged = 0;
  for (const r of rows) {
    if (recentlyNotified.has(r.user_id)) continue;
    const counts = perVendor.get(r.vendor_id) ?? { stale: 0, hot: 0 };
    if (counts.stale === 0 && counts.hot === 0) continue;
    const parts: string[] = [];
    if (counts.stale > 0) {
      parts.push(
        `${counts.stale} new ${
          counts.stale === 1 ? "inquiry" : "inquiries"
        } waiting`,
      );
    }
    if (counts.hot > 0) {
      parts.push(
        `${counts.hot} hot ${
          counts.hot === 1 ? "lead" : "leads"
        } not followed up`,
      );
    }
    const body = parts.join(" · ") +
      ". Open My Space and ask me to draft replies.";
    await admin.from("notifications").insert({
      user_id: r.user_id,
      type: "my_space_proactive",
      title: "My Space has suggestions for you",
      body,
      link: "/vendor/ai-superagents",
    });
    nudged += 1;
  }

  return new Response(
    JSON.stringify({ nudged, scanned_vendors: rows.length }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
