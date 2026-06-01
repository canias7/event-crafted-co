// Vendor onboarding nudge scanner. Calls
// enqueue_vendor_onboarding_nudges() to find vendors with incomplete
// profiles past their grace period, then emails each one a nudge
// pointing back at /vendor/onboarding.
//
// Schedule daily.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS =
  Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <noreply@eventvendora.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";
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
  user_id: string;
  business_name: string;
  email: string | null;
  missing_count: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  if (CRON_SECRET) {
    const provided = req.headers.get("x-cron-secret") ??
      (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (provided !== CRON_SECRET) {
      return json({ error: "unauthorized" }, 401);
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Supabase admin credentials not set" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await admin.rpc(
    "enqueue_vendor_onboarding_nudges",
  );
  if (error) return json({ error: error.message }, 500);

  const rows = (data as Row[] | null) ?? [];
  if (rows.length === 0) {
    return json({ ok: true, nudged: 0 }, 200);
  }

  if (!RESEND_API_KEY) {
    return json(
      { ok: true, nudged: rows.length, emailed: 0, note: "RESEND_API_KEY not set" },
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
        subject: nudgeSubject(r),
        html: nudgeHtml(r),
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
      nudged: rows.length,
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

function nudgeSubject(r: Row) {
  return `Finish your Vendora profile — ${r.missing_count} ${r.missing_count === 1 ? "step" : "steps"} left`;
}

function nudgeHtml(r: Row) {
  const link = `${APP_URL}/vendor/onboarding`;
  return `<!doctype html>
<html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;">
        <tr><td style="padding-bottom:12px;"><img src="https://eventvendora.com/pwa-192.png" alt="Vendora" width="44" height="44" style="display:block;border:0;border-radius:8px;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" /></td></tr>
        <tr><td style="font-size:12px;letter-spacing:0.18em;color:#a08259;text-transform:uppercase;padding-bottom:24px;">Profile checklist</td></tr>
        <tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">
          ${escape(r.business_name)} is almost ready
        </td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;">
          <p style="margin:0 0 16px;">Hi! Your Vendora profile is partially set up — a few quick steps and you'll start showing up to hosts in the directory.</p>
          <p style="margin:0 0 24px;">${r.missing_count} ${r.missing_count === 1 ? "thing" : "things"} left: bio, packages, portfolio photos, and location. Profiles with all four convert ~3× more inquiries.</p>
          <p style="margin:0 0 24px;">
            <a href="${link}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:500;">Finish setup</a>
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
