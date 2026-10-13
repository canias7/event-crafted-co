// Emails a host when a vendor replies to their inquiry (owner's call,
// Oct 2026). Runs every 5 minutes from pg_cron (migration
// 20261013121000_host_reply_emails.sql).
//
// claim_host_reply_emails() picks vendor messages that are 10-60 minutes
// old, unread by the host, not muted and not emailed yet, marks them
// emailed and returns one row per thread, so a burst of messages becomes
// a single email. Hosts who set notification_prefs.reply_email = false
// (Settings -> Notifications) are skipped by the function.
//
// Required env: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional env: EMAIL_FROM_ADDRESS, APP_URL.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <noreply@eventvendora.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface ReplyRow {
  thread_id: string;
  inquiry_id: string | null;
  host_id: string;
  email: string | null;
  vendor_name: string | null;
  message_count: number;
  latest_body: string | null;
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

  // Without a mail key, leave the messages unclaimed so they go out once
  // the key is set (within the 60-minute window).
  if (!RESEND_API_KEY) {
    return json({ ok: true, emailed: 0, note: "RESEND_API_KEY not set" }, 200);
  }

  const { data, error } = await admin.rpc("claim_host_reply_emails");
  if (error) return json({ error: error.message }, 500);
  const rows = (data as ReplyRow[] | null) ?? [];

  let emailed = 0;
  const errors: string[] = [];
  for (const r of rows) {
    if (!r.email) continue;
    const vendor = r.vendor_name || "Your vendor";
    const link = r.inquiry_id
      ? `${APP_URL}/customer/inquiries/${r.inquiry_id}`
      : `${APP_URL}/customer/inquiries`;
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: r.email,
        subject: `${vendor} replied to your inquiry`,
        html: replyHtml(vendor, r, link),
      }),
    });
    if (send.ok) emailed++;
    else errors.push(`${r.email}: ${await send.text()}`);
  }

  return json(
    { ok: true, threads: rows.length, emailed, errors: errors.length ? errors : undefined },
    200,
  );
});

function replyHtml(vendor: string, r: ReplyRow, link: string) {
  const snippet = (r.latest_body ?? "").trim();
  const short = snippet.length > 300 ? `${snippet.slice(0, 300)}…` : snippet;
  const more =
    r.message_count > 1
      ? `<p style="margin:0 0 16px;font-size:13px;color:#777;">${r.message_count} new messages</p>`
      : "";
  const quote = short
    ? `<p style="margin:0 0 16px;padding:12px 16px;background:#f7f5f2;border-radius:8px;white-space:pre-wrap;">${escape(short)}</p>`
    : "";
  const body = `
    <p style="margin:0 0 16px;"><strong>${escape(vendor)}</strong> sent you a message on Vendora.</p>
    ${quote}
    ${more}
    <p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:500;">Read and reply</a></p>
    <p style="margin:0;font-size:12px;color:#999;">You get these emails because reply emails are on. You can turn them off in <a href="${APP_URL}/settings/notifications" style="color:#999;">Settings → Notifications</a>.</p>`;
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;">
          <tr><td style="padding-bottom:24px;"><img src="https://eventvendora.com/pwa-192.png" alt="Vendora" width="44" height="44" style="display:block;border:0;border-radius:8px;" /></td></tr>
          <tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">New reply from ${escape(vendor)}</td></tr>
          <tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;">${body}</td></tr>
          <tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;">Vendora · Premium event planning &amp; vendor marketplace</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escape(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
