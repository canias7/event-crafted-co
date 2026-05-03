// Vendor weekly digest scanner. Calls enqueue_vendor_weekly_digests
// to grab the past-week summary per opted-in vendor, then sends one
// email each via Resend.
//
// Schedule weekly (Monday morning works for most US vendors).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <hello@vendora.events>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://vendora.events";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Row {
  vendor_id: string;
  vendor_name: string | null;
  recipient_email: string | null;
  inquiries_new: number;
  inquiries_replied: number;
  bookings_new: number;
  reviews_new: number;
  median_response_hours: number | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Supabase admin credentials not set" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await admin.rpc("enqueue_vendor_weekly_digests");
  if (error) return json({ error: error.message }, 500);

  const rows = (data as Row[] | null) ?? [];
  if (rows.length === 0) {
    return json({ ok: true, digested: 0, emailed: 0 }, 200);
  }

  if (!RESEND_API_KEY) {
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
    if (!r.recipient_email) continue;
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: r.recipient_email,
        subject: digestSubject(r),
        html: digestHtml(r),
      }),
    });
    if (send.ok) {
      emailed++;
    } else {
      errors.push(`${r.recipient_email}: ${await send.text()}`);
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

function fmtHours(h: number | null) {
  if (h == null || !Number.isFinite(h)) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} hrs`;
  return `${Math.round(h / 24)} days`;
}

function digestSubject(r: Row) {
  const total = r.inquiries_new + r.bookings_new + r.reviews_new;
  return `Vendora · ${r.vendor_name ?? "Your"} weekly recap · ${total} ${total === 1 ? "update" : "updates"}`;
}

function digestHtml(r: Row) {
  const link = `${APP_URL}/vendor/dashboard`;
  const analyticsLink = `${APP_URL}/vendor/analytics`;
  const stats = [
    { label: "New inquiries", value: r.inquiries_new },
    { label: "Replied", value: r.inquiries_replied },
    { label: "New bookings", value: r.bookings_new },
    { label: "New reviews", value: r.reviews_new },
  ]
    .map(
      (s) => `
      <td style="padding:16px 8px;text-align:center;background:#f7f5f2;border-radius:6px;">
        <p style="margin:0;font-size:24px;font-weight:600;">${s.value}</p>
        <p style="margin:4px 0 0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#777;">${s.label}</p>
      </td>`,
    )
    .join('<td style="width:8px;"></td>');

  return `<!doctype html>
<html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;">
        <tr><td style="font-size:14px;letter-spacing:0.18em;color:#a08259;text-transform:uppercase;padding-bottom:24px;">— Vendora · Weekly recap</td></tr>
        <tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:24px;">
          ${escape(r.vendor_name ?? "Your")} · last 7 days
        </td></tr>
        <tr><td style="padding-bottom:20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>${stats}</tr>
          </table>
        </td></tr>
        <tr><td style="font-size:14px;line-height:1.6;color:#3a3a3a;padding-bottom:20px;">
          Median response time:
          <strong>${fmtHours(r.median_response_hours)}</strong>
          ${
            r.median_response_hours != null && r.median_response_hours <= 3
              ? '<span style="color:#a08259;"> · keeps your "Fast responder" badge active</span>'
              : ""
          }
        </td></tr>
        <tr><td style="padding-bottom:8px;">
          <a href="${link}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:500;margin-right:8px;">Open dashboard</a>
          <a href="${analyticsLink}" style="display:inline-block;background:transparent;color:#1a1a1a;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:500;border:1px solid #e0e0e0;">See analytics</a>
        </td></tr>
        <tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;line-height:1.6;">
          You're getting this weekly recap because vendor digests are on.
          <a href="${APP_URL}/vendor/profile" style="color:#a08259;text-decoration:none;">Turn it off in your profile</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
