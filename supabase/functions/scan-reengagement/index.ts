// Daily scheduled scan: find anniversaries / milestone re-engagement
// opportunities for vendors and notify them so they can reach out to
// past clients. Backed by find_reengagement_opportunities() RPC.
//
// Schedule via Supabase pg_cron once per day. No body expected.
//
// Per matched opportunity:
//   1. Send a transactional email to the vendor with a one-line
//      summary + CTA to compose a re-inquiry message.
//   2. Insert an in-app notification.
//   3. Write to vendor_reengagement_log so the row doesn't fire again
//      tomorrow.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Opportunity {
  vendor_id: string;
  host_id: string;
  inquiry_id: string;
  occasion: string;
  event_type: string;
  upcoming_date: string;
  vendor_user_id: string;
  vendor_business_name: string;
  host_email: string | null;
  host_display_name: string | null;
}

const OCCASION_LABEL: Record<string, string> = {
  anniversary_1y: "1-year anniversary",
  anniversary_2y: "2-year anniversary",
  anniversary_5y: "5-year anniversary",
};

// Event-type-aware copy snippet. The marketplace covers more than
// weddings, so generic "your client" language with a per-type hook.
const TYPE_HOOK: Record<string, string> = {
  wedding: "an anniversary photo session, vow renewal, or family portrait shoot",
  birthday: "a milestone birthday party rebooking",
  holiday_dinner: "this year's holiday gathering",
  other: "a follow-on event",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "missing env" }, 500);
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: opportunities, error } = await sb.rpc(
    "find_reengagement_opportunities",
  );
  if (error) return json({ error: error.message }, 500);

  let processed = 0;
  let emailed = 0;

  for (const op of (opportunities as Opportunity[] | null) ?? []) {
    // Look up vendor's email + display name.
    const { data: vendorAuth } = await sb.auth.admin.getUserById(
      op.vendor_user_id,
    );
    const vendorEmail = vendorAuth?.user?.email ?? null;

    // Insert notification (always, regardless of email outcome).
    await sb.from("notifications").insert({
      user_id: op.vendor_user_id,
      type: "reengagement_opportunity",
      title: `${op.host_display_name ?? "A past client"}'s ${OCCASION_LABEL[op.occasion] ?? "anniversary"} is in 30 days`,
      body: `Reach out about ${TYPE_HOOK[op.event_type] ?? TYPE_HOOK.other} before someone else does.`,
      link: `/vendor/inbox`,
    });

    // Send email if we have an address and Resend is set up.
    if (vendorEmail) {
      const emailRes = await sb.functions.invoke("send-transactional-email", {
        body: {
          kind: "reengagement_opportunity",
          to: vendorEmail,
          vendorBusinessName: op.vendor_business_name,
          hostDisplayName: op.host_display_name ?? "your past client",
          occasion: OCCASION_LABEL[op.occasion] ?? "anniversary",
          eventType: op.event_type,
          upcomingDate: op.upcoming_date,
          inquiryId: op.inquiry_id,
        },
      });
      if (!emailRes.error) emailed++;
    }

    // Log so we don't re-send tomorrow.
    await sb.from("vendor_reengagement_log").insert({
      vendor_id: op.vendor_id,
      host_id: op.host_id,
      inquiry_id: op.inquiry_id,
      occasion: op.occasion,
      event_type: op.event_type,
      upcoming_date: op.upcoming_date,
    });
    processed++;
  }

  return json({ processed, emailed }, 200);
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
