// Daily digest sender. Calls enqueue_pending_digests() to atomically
// pick up all unread + un-digested notifications from the last N hours
// and group them per user. Then sends one Resend email per user.
//
// Schedule once a day, ideally morning (8-9am local-major-market).
//
// Required env: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional env: DIGEST_LOOKBACK_HOURS (default 24), EMAIL_FROM_ADDRESS,
//               APP_URL.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <hello@vendora.app>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://vendora.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const LOOKBACK_HOURS = Number.parseInt(
  Deno.env.get("DIGEST_LOOKBACK_HOURS") ?? "24",
  10,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DigestNotification {
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
}

interface DigestRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string | null;
  notifications: DigestNotification[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Supabase admin credentials not set" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await admin.rpc("enqueue_pending_digests", {
    p_lookback_hours: LOOKBACK_HOURS,
  });
  if (error) return json({ error: error.message }, 500);

  const rows = (data as DigestRow[] | null) ?? [];
  if (rows.length === 0) {
    return json({ ok: true, digested: 0, emailed: 0 }, 200);
  }

  if (!RESEND_API_KEY) {
    // Notifications are still marked digested; report skipped emails.
    return json(
      {
        ok: true,
        digested: rows.length,
        emailed: 0,
        note: "RESEND_API_KEY not set",
      },
      200,
    );
  }

  let emailed = 0;
  const errors: string[] = [];
  for (const r of rows) {
    if (!r.email) continue;
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: r.email,
        subject: digestSubject(r),
        html: digestHtml(r),
      }),
    });
    if (send.ok) {
      emailed++;
    } else {
      errors.push(`${r.email}: ${await send.text()}`);
    }
  }

  return json(
    {
      ok: true,
      digested: rows.length,
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

function digestSubject(r: DigestRow) {
  const n = r.notifications.length;
  const noun = n === 1 ? "update" : "updates";
  return `Vendora · ${n} ${noun} since yesterday`;
}

function dashboardLink(r: DigestRow) {
  if (r.role === "vendor") return `${APP_URL}/vendor/dashboard`;
  if (r.role === "admin") return `${APP_URL}/admin/dashboard`;
  return `${APP_URL}/customer/dashboard`;
}

function digestHtml(r: DigestRow) {
  const greeting = r.display_name ? `Hi ${escape(r.display_name)},` : "Hi,";
  const items = r.notifications
    .map((n) => {
      const href = n.link ? `${APP_URL}${n.link}` : null;
      const title = href
        ? `<a href="${href}" style="color:#1a1a1a;text-decoration:none;">${escape(n.title)}</a>`
        : escape(n.title);
      const body = n.body
        ? `<p style="margin:6px 0 0;font-size:13px;color:#777;line-height:1.5;">${escape(n.body)}</p>`
        : "";
      return `<li style="padding:14px 0;border-bottom:1px solid #ececec;">
        <p style="margin:0;font-size:14px;font-weight:600;">${title}</p>
        ${body}
      </li>`;
    })
    .join("\n");

  const dashLink = dashboardLink(r);

  return `<!doctype html>
<html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;">
        <tr><td style="font-size:14px;letter-spacing:0.18em;color:#a08259;text-transform:uppercase;padding-bottom:24px;">— Vendora · Daily digest</td></tr>
        <tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:8px;">
          ${r.notifications.length} ${r.notifications.length === 1 ? "update" : "updates"} since yesterday
        </td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;padding-bottom:16px;">
          ${greeting}
        </td></tr>
        <tr><td>
          <ul style="margin:0;padding:0;list-style:none;">
            ${items}
          </ul>
        </td></tr>
        <tr><td style="padding-top:32px;">
          <a href="${dashLink}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:500;">Open dashboard</a>
        </td></tr>
        <tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;line-height:1.6;">
          You're getting this digest because daily summary emails are on.
          <a href="${APP_URL}/settings" style="color:#a08259;text-decoration:none;">Manage email preferences</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
