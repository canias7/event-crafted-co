// VendoraPay notifications. Fired from vendorapay-webhook on
// payment.succeeded (and later: refund, dispute). One endpoint that:
//
//   1. Inserts a row into public.notifications for each vendor team
//      admin so the in-app bell badge lights up.
//   2. Sends a "$X received" Resend email to each admin.
//   3. Sends a branded receipt to the host if we have their email.
//
// Self-contained — doesn't depend on send-transactional-email so the
// payment flow can ship/iterate without touching that 700-line file.
//
// Caller (vendorapay-webhook) sends Authorization: Bearer
// ${SUPABASE_SERVICE_ROLE_KEY} on every call. This endpoint runs
// with verify_jwt=false (Supabase JWT verifier off) BUT enforces
// service-role bearer manually so anonymous callers can't spoof
// "$X received" emails impersonating any vendor.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_ADDRESS = Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <noreply@eventvendora.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function shellHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;">
<tr><td style="padding-bottom:24px;"><img src="https://eventvendora.com/pwa-192.png" alt="Vendora" width="44" height="44" style="display:block;border:0;border-radius:8px;" /></td></tr>
<tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">${title}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;">${bodyHtml}</td></tr>
<tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;">VendoraPay · Premium event payments</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:500;">${label}</a>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("[vendorapay-notify] RESEND_API_KEY not set; skipping email", to);
    return false;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });
  if (!r.ok) {
    console.error("[vendorapay-notify] resend error", to, await r.text());
    return false;
  }
  return true;
}

interface PaymentReceivedPayload {
  kind: "payment_received";
  vendor_id: string;
  amount_cents: number;
  currency: string;
  description: string;
  host_email?: string | null;
  payment_link_id?: string | null;
  proposal_id?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  // Service-role bearer required (matches what vendorapay-webhook
  // sends). Anything else is a spoof attempt — log and drop.
  const authHeader = req.headers.get("Authorization") ?? "";
  const expected = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  if (authHeader !== expected) {
    console.warn("[vendorapay-notify] unauthorized call rejected");
    return json(401, { error: "unauthorized" });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as PaymentReceivedPayload;
    if (body.kind !== "payment_received") return json(400, { error: "unknown kind" });
    if (!body.vendor_id) return json(400, { error: "vendor_id required" });
    if (!Number.isInteger(body.amount_cents) || body.amount_cents < 1) {
      return json(400, { error: "amount_cents required" });
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: vp } = await db
      .from("vendor_profiles")
      .select("business_name, logo_url")
      .eq("id", body.vendor_id)
      .maybeSingle();
    const vpRow = vp as { business_name?: string | null; logo_url?: string | null } | null;
    const businessName = vpRow?.business_name ?? "Your business";
    const logoUrl = vpRow?.logo_url ?? null;

    const amount = formatMoney(body.amount_cents, body.currency);
    const link = body.payment_link_id
      ? `${APP_URL}/vendor/payments?tab=links`
      : `${APP_URL}/vendor/payments`;

    // 1) Vendor admins — in-app notification + email each.
    const { data: members } = await db
      .from("vendor_team_members")
      .select("user_id, role")
      .eq("vendor_id", body.vendor_id)
      .in("role", ["owner", "admin"]);
    const adminRows = (members ?? []) as Array<{ user_id: string; role: string }>;

    if (adminRows.length > 0) {
      const notifRows = adminRows.map((m) => ({
        user_id: m.user_id,
        type: "vendorapay_payment_received",
        title: `${amount} received`,
        body: body.description,
        link,
      }));
      const { error: notifErr } = await db.from("notifications").insert(notifRows);
      if (notifErr) console.error("[vendorapay-notify] notifications insert failed", notifErr);

      for (const m of adminRows) {
        const { data: userRow } = await db.auth.admin.getUserById(m.user_id);
        const email = userRow?.user?.email;
        if (!email) continue;
        const fromCopy = body.host_email
          ? `from <strong>${escapeHtml(body.host_email)}</strong>`
          : "from a host";
        const html = shellHtml(
          `${amount} arrived in VendoraPay`,
          `<p style="margin:0 0 16px;">Good news — a payment of <strong>${amount}</strong> just landed in your ${escapeHtml(businessName)} account ${fromCopy}.</p>
           <p style="margin:0 0 24px;color:#3a3a3a;">${escapeHtml(body.description)}</p>
           <p style="margin:0 0 24px;">${button(link, "Open VendoraPay")}</p>
           <p style="margin:0;font-size:13px;color:#777;">Funds settle to your bank in 2 business days.</p>`,
        );
        await sendEmail(email, `${amount} received — ${body.description}`, html);
      }
    }

    // 2) Host — branded receipt if we have an email.
    if (body.host_email) {
      const paidAt = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const logoHtml = logoUrl
        ? `<div style="margin:0 0 16px;"><img src="${logoUrl}" alt="${escapeHtml(businessName)}" width="44" height="44" style="display:block;border:0;border-radius:8px;object-fit:cover;" /></div>`
        : "";
      const html = shellHtml(
        "Payment received",
        `${logoHtml}
         <p style="margin:0 0 8px;font-size:13px;color:#777;">Receipt from ${escapeHtml(businessName)}</p>
         <p style="margin:0 0 24px;font-size:32px;font-weight:600;line-height:1.2;">${amount}</p>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ececec;border-bottom:1px solid #ececec;padding:16px 0;margin:0 0 24px;">
           <tr>
             <td style="padding:8px 0;font-size:14px;color:#3a3a3a;">${escapeHtml(body.description)}</td>
             <td style="padding:8px 0;font-size:14px;color:#3a3a3a;text-align:right;">${amount}</td>
           </tr>
         </table>
         <p style="margin:0 0 8px;font-size:13px;color:#777;">Paid on ${escapeHtml(paidAt)}</p>
         <p style="margin:0 0 8px;font-size:13px;color:#777;">"VENDORAPAY" will appear on your card statement.</p>
         <p style="margin:24px 0 0;font-size:13px;color:#777;">Questions about this charge? Reply to this email and we'll connect you with ${escapeHtml(businessName)}.</p>`,
      );
      await sendEmail(body.host_email, `${amount} receipt — ${businessName}`, html);
    }

    return json(200, { ok: true, admins_notified: adminRows.length, host_emailed: Boolean(body.host_email) });
  } catch (err) {
    console.error("[vendorapay-notify] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: "notify_failed", detail: message.slice(0, 240) });
  }
});
