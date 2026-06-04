// VendoraPay daily cron (8am UTC). Two jobs:
//
//   1. Promote scheduled balance links whose activate_at has passed,
//      then email the host a "balance due" reminder.
//   2. Mark invoices whose due_date has passed as 'overdue'.
//
// Invoice REMINDER emails used to live here too (3-day cadence,
// max 3 nudges). That logic was removed once scan-vendorapay-overdue
// shipped (PR #982) — the new scanner does the same job with a
// 7-day cadence, no max, per-vendor branding, and verified-domain
// From headers. With both crons running on different throttle
// columns (reminder_count vs reminder_sent_at), buyers were getting
// duplicate reminders. We kept the status-promotion step here so
// the new scanner has a 'sent → overdue' transition to react to.
//
// Idempotent on both (status filters prevent re-flips). Skips
// balance promotion when the parent deposit was cancelled or
// refunded — vendor backed out, don't pursue the balance.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_ADDRESS = Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Vendora <noreply@eventvendora.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}
function shellHtml(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;"><tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;"><tr><td style="padding-bottom:24px;"><img src="https://eventvendora.com/pwa-192.png" alt="Vendora" width="44" height="44" style="display:block;border:0;border-radius:8px;" /></td></tr><tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">${title}</td></tr><tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;">${bodyHtml}</td></tr><tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;">VendoraPay · Premium event payments</td></tr></table></td></tr></table></body></html>`;
}
function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:500;">${label}</a>`;
}
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  // The balance link is already live by the time we send this, so a
  // transient Resend failure shouldn't silently leave the host uninformed —
  // retry a couple of times with a short backoff.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
      });
      if (r.ok) return true;
      console.error("[scan-vendorapay-payment-schedules] resend error", to, r.status, await r.text());
    } catch (err) {
      console.error("[scan-vendorapay-payment-schedules] resend threw", to, err);
    }
    if (attempt < 2) await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
  }
  return false;
}

serve(async (req) => {
  // M1/M2: authenticate the cron caller against the Vault 'cron_secret'
  // via the cron_secret_ok RPC. Dormant (allows) until the secret exists;
  // fails OPEN on RPC error so a transient DB blip can't break the crons.
  {
    const provided = req.headers.get("x-cron-secret") ??
      (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const _authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: _cronOk, error: _cronErr } = await _authClient.rpc("cron_secret_ok", { provided });
    // Fail CLOSED on an RPC error (was failing open). Still dormant when no
    // secret is configured (cron_secret_ok returns true), so this only
    // rejects when a secret exists and the provided value didn't match.
    if (_cronErr || _cronOk === false) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  try {
    const nowIso = new Date().toISOString();
    let promoted = 0;
    let emailed = 0;
    let invoicesMarkedOverdue = 0;

    // 1) Promote scheduled balance links whose activate_at has passed.
    const { data: due } = await db
      .from("payment_links")
      .select("id, vendor_id, slug, title, amount_cents, currency, parent_link_id")
      .eq("status", "scheduled")
      .lte("activate_at", nowIso)
      .limit(200);
    const rows = (due ?? []) as Array<{
      id: string;
      vendor_id: string;
      slug: string;
      title: string;
      amount_cents: number;
      currency: string;
      parent_link_id: string | null;
    }>;

    for (const r of rows) {
      // Skip + cancel if the parent (deposit) was cancelled or
      // refunded — vendor backed out, don't pursue balance.
      if (r.parent_link_id) {
        const { data: parent } = await db
          .from("payment_links")
          .select("status, host_email")
          .eq("id", r.parent_link_id)
          .maybeSingle();
        const parentStatus = (parent as { status?: string } | null)?.status;
        if (parentStatus && ["cancelled", "refunded", "partial_refund"].includes(parentStatus)) {
          await db
            .from("payment_links")
            .update({ status: "cancelled", updated_at: nowIso })
            .eq("id", r.id)
            .eq("status", "scheduled");
          continue;
        }
      }
      const { data: updated } = await db
        .from("payment_links")
        .update({ status: "active", updated_at: nowIso })
        .eq("id", r.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();
      if (!updated) continue;
      promoted++;

      let hostEmail: string | null = null;
      let businessName = "your vendor";
      let logoUrl: string | null = null;
      if (r.parent_link_id) {
        const { data: parent } = await db
          .from("payment_links")
          .select("host_email")
          .eq("id", r.parent_link_id)
          .maybeSingle();
        hostEmail = (parent as { host_email?: string | null } | null)?.host_email ?? null;
      }
      const { data: vp } = await db
        .from("vendor_profiles")
        .select("user_id, business_name, logo_url")
        .eq("id", r.vendor_id)
        .maybeSingle();
      const vpRow = vp as { user_id?: string | null; business_name?: string | null; logo_url?: string | null } | null;
      // Account-wide opt-in gate: skip (and don't bill) reminders for
      // accounts that haven't enabled client email sending.
      const { data: esRow } = await db
        .from("vendor_email_settings")
        .select("sending_enabled")
        .eq("user_id", vpRow?.user_id ?? "")
        .maybeSingle();
      if (!(esRow as { sending_enabled?: boolean } | null)?.sending_enabled) continue;
      if (vpRow?.business_name) businessName = vpRow.business_name;
      logoUrl = vpRow?.logo_url ?? null;

      if (!hostEmail) continue;

      const amount = formatMoney(r.amount_cents, r.currency);
      const payUrl = `${APP_URL}/pay/link/${r.slug}`;
      // HTML-escape logoUrl (defense in depth): the column has no
      // URL-shape constraint, and a hostile vendor can poison it
      // with `x" onerror="…` via supabase-js. escapeHtml turns the
      // `"` into `&quot;` so it can't break out of the src attr.
      const logoHtml = logoUrl
        ? `<div style="margin:0 0 16px;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(businessName)}" width="44" height="44" style="display:block;border:0;border-radius:8px;object-fit:cover;" /></div>`
        : "";
      const html = shellHtml(
        `Balance due: ${amount}`,
        `${logoHtml}<p style="margin:0 0 16px;">The remaining balance for <strong>${escapeHtml(r.title)}</strong> with ${escapeHtml(businessName)} is now due.</p><p style="margin:0 0 24px;font-size:28px;font-weight:600;">${amount}</p><p style="margin:0 0 24px;">${button(payUrl, `Pay ${amount}`)}</p><p style="margin:0;font-size:13px;color:#777;">Card payments processed securely via VendoraPay.</p>`,
      );
      const ok = await sendEmail(hostEmail, `Balance due (${amount}) — ${businessName}`, html);
      if (ok) {
        emailed++;
      }
    }

    // 2) Mark invoices overdue when due_date has passed. We KEEP
    // this step — scan-vendorapay-overdue (which sends the actual
    // reminder emails) reads status in ('sent','overdue') so the
    // flip isn't load-bearing for it, but the InvoicesTab UI uses
    // status='overdue' to render the rose pill, so vendors get
    // accurate visual state once daily.
    const today = new Date().toISOString().slice(0, 10);
    const { data: overdueUpd, error: overdueErr } = await db
      .from("invoices")
      .update({ status: "overdue", updated_at: nowIso })
      .eq("status", "sent")
      .lt("due_date", today)
      .select("id");
    if (overdueErr) console.error("[scan-vendorapay-payment-schedules] invoice overdue failed", overdueErr);
    invoicesMarkedOverdue = (overdueUpd ?? []).length;

    // Invoice REMINDER emails used to live here (3-day cadence,
    // max 3). Removed when scan-vendorapay-overdue shipped; that
    // function handles all reminder emails now with a 7-day cadence
    // and per-vendor brand. Running both meant buyers got duplicate
    // nudges (different throttle columns, no coordination).

    return new Response(
      JSON.stringify({
        ok: true,
        candidates: rows.length,
        promoted,
        emailed,
        invoices_marked_overdue: invoicesMarkedOverdue,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[scan-vendorapay-payment-schedules] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500 });
  }
});
