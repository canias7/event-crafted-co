// Scan-and-send for the review prompt loop. Calls the SECURITY DEFINER
// enqueue_pending_review_prompts() RPC to atomically mark eligible
// inquiries as prompted + drop in-app notifications, then sends one
// email per host.
//
// Schedule this once per day. With Supabase you can either:
//   1. Use pg_cron + pg_net to call this URL (requires extensions)
//   2. Use an external cron (GitHub Actions, EasyCron, etc.) hitting
//      POST {SUPABASE_URL}/functions/v1/scan-review-prompts
//      with header "Authorization: Bearer {SUPABASE_ANON_KEY}"
//   3. Manually trigger from /admin once we add a button
//
// Required env: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// Optional env: REVIEW_PROMPT_AFTER_DAYS (default 3) — how many days
// after event_date before the prompt fires.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <hello@vendora.app>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://vendora.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AFTER_DAYS = Number.parseInt(
  Deno.env.get("REVIEW_PROMPT_AFTER_DAYS") ?? "3",
  10,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Eligible {
  inquiry_id: string;
  host_id: string;
  vendor_id: string;
  vendor_name: string;
  event_type: string;
  event_date: string;
  host_email: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Supabase admin credentials not set" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await admin.rpc("enqueue_pending_review_prompts", {
    p_after_days: AFTER_DAYS,
  });
  if (error) {
    return json({ error: error.message }, 500);
  }

  const rows = (data as Eligible[] | null) ?? [];
  if (rows.length === 0) {
    return json({ ok: true, prompted: 0, emailed: 0 }, 200);
  }

  if (!RESEND_API_KEY) {
    // Notifications were still inserted in-app; just report that emails
    // were skipped because Resend isn't configured.
    return json(
      { ok: true, prompted: rows.length, emailed: 0, note: "RESEND_API_KEY not set" },
      200,
    );
  }

  let emailed = 0;
  const errors: string[] = [];
  for (const r of rows) {
    if (!r.host_email) continue;
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: r.host_email,
        subject: `How was your ${r.event_type.replace(/_/g, " ")} with ${r.vendor_name}?`,
        html: reviewPromptHtml(r),
      }),
    });
    if (send.ok) {
      emailed++;
    } else {
      errors.push(`${r.host_email}: ${await send.text()}`);
    }
  }

  return json(
    {
      ok: true,
      prompted: rows.length,
      emailed,
      errors: errors.length ? errors : undefined,
    },
    200,
  );
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function escape(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function reviewPromptHtml(r: Eligible) {
  const link = `${APP_URL}/customer/inquiries/${r.inquiry_id}`;
  const eventType = r.event_type.replace(/_/g, " ");
  return `<!doctype html>
<html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;">
        <tr><td style="font-size:14px;letter-spacing:0.18em;color:#a08259;text-transform:uppercase;padding-bottom:24px;">— Vendora</td></tr>
        <tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">
          How was your ${escape(eventType)}?
        </td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;">
          <p style="margin:0 0 16px;">Hope your ${escape(eventType)} went beautifully. We'd love to hear how <strong>${escape(r.vendor_name)}</strong> showed up for you.</p>
          <p style="margin:0 0 24px;">A short review takes a minute and helps the next host pick the right team with confidence.</p>
          <p style="margin:0 0 24px;">
            <a href="${link}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:500;">Leave a review</a>
          </p>
          <p style="margin:0;font-size:13px;color:#777;">Or paste this into your browser:<br/><span style="word-break:break-all;">${link}</span></p>
        </td></tr>
        <tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;">
          Vendora · Premium event planning &amp; vendor marketplace
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
