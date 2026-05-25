// VendoraPay: POST /vendorapay-invoice-send { invoice_id }
//
// Vendor-initiated email send. Caller must be a team admin of the
// invoice's vendor. Marks the invoice as 'sent' (was 'draft'),
// stamps sent_at, and emails the bill_to_email a branded invoice
// with the Pay URL.
//
// Idempotent: re-sending a 'sent' invoice resends the email but
// doesn't reset sent_at — vendors can nudge a host without
// changing the issue timeline.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}
function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
function shellHtml(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;"><tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;"><tr><td style="padding-bottom:24px;"><img src="https://eventvendora.com/pwa-192.png" alt="Vendora" width="44" height="44" style="display:block;border:0;border-radius:8px;" /></td></tr><tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">${title}</td></tr><tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;">${bodyHtml}</td></tr><tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;">VendoraPay · Premium event payments</td></tr></table></td></tr></table></body></html>`;
}
function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:500;">${label}</a>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!RESEND_API_KEY) return json(500, { error: "resend_not_configured" });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "unauthorized" });

    const body = await req.json().catch(() => ({}));
    const invoiceId = body?.invoice_id as string | undefined;
    if (!invoiceId) return json(400, { error: "invoice_id required" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: inv } = await admin
      .from("invoices")
      .select("id, vendor_id, slug, invoice_number, bill_to_name, bill_to_email, issue_date, due_date, line_items, subtotal_cents, tax_cents, tax_rate_bps, total_cents, currency, status, notes")
      .eq("id", invoiceId)
      .maybeSingle();
    if (!inv) return json(404, { error: "invoice not found" });
    if (!inv.bill_to_email) return json(400, { error: "bill_to_email required to send" });
    // Status guard: don't email an invoice that's already paid,
    // cancelled, or refunded. Resending a draft / sent / overdue
    // invoice is fine (vendor nudge).
    if (!["draft", "sent", "overdue"].includes(inv.status as string)) {
      return json(400, { error: `cannot send invoice with status '${inv.status}'` });
    }

    const { data: isAdmin } = await userClient.rpc("is_vendor_team_admin", { _vendor_id: inv.vendor_id });
    if (!isAdmin) return json(403, { error: "admin role required" });

    const { data: vp } = await admin
      .from("vendor_profiles")
      .select("business_name, logo_url")
      .eq("id", inv.vendor_id)
      .maybeSingle();
    const vpRow = vp as { business_name?: string | null; logo_url?: string | null } | null;
    const businessName = vpRow?.business_name ?? "your vendor";
    const logoUrl = vpRow?.logo_url ?? null;

    const items = ((inv.line_items as any[]) ?? []) as Array<{ name: string; qty: number; unit_price_cents: number; total_cents?: number }>;
    const currency = (inv.currency as string) ?? "usd";
    const payUrl = `${APP_URL}/pay/invoice/${inv.slug}`;
    const logoHtml = logoUrl
      ? `<div style="margin:0 0 16px;"><img src="${logoUrl}" alt="${escapeHtml(businessName)}" width="44" height="44" style="display:block;border:0;border-radius:8px;object-fit:cover;" /></div>`
      : "";
    const rowsHtml = items
      .map(
        (li) =>
          `<tr><td style="padding:8px 0;font-size:14px;color:#3a3a3a;">${escapeHtml(li.name)} <span style="color:#999;">× ${li.qty}</span></td><td style="padding:8px 0;font-size:14px;color:#3a3a3a;text-align:right;">${formatMoney(li.total_cents ?? li.qty * li.unit_price_cents, currency)}</td></tr>`,
      )
      .join("");
    const taxRow =
      (inv.tax_cents as number) > 0
        ? `<tr><td style="padding:6px 0;font-size:13px;color:#777;">Tax (${((inv.tax_rate_bps as number) / 100).toFixed(2)}%)</td><td style="padding:6px 0;font-size:13px;color:#777;text-align:right;">${formatMoney(inv.tax_cents as number, currency)}</td></tr>`
        : "";
    const html = shellHtml(
      `Invoice ${inv.invoice_number} from ${businessName}`,
      `${logoHtml}<p style="margin:0 0 8px;font-size:13px;color:#777;">From ${escapeHtml(businessName)}</p><p style="margin:0 0 4px;font-size:14px;">Issued ${formatDate(inv.issue_date as any)}${inv.due_date ? ` · Due ${formatDate(inv.due_date as any)}` : ""}</p><p style="margin:0 0 24px;font-size:32px;font-weight:600;line-height:1.2;">${formatMoney(inv.total_cents as number, currency)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ececec;border-bottom:1px solid #ececec;padding:8px 0;margin:0 0 16px;">${rowsHtml}<tr><td style="padding-top:12px;font-size:13px;color:#777;">Subtotal</td><td style="padding-top:12px;font-size:13px;color:#777;text-align:right;">${formatMoney(inv.subtotal_cents as number, currency)}</td></tr>${taxRow}<tr><td style="padding:6px 0;font-size:15px;font-weight:600;">Total</td><td style="padding:6px 0;font-size:15px;font-weight:600;text-align:right;">${formatMoney(inv.total_cents as number, currency)}</td></tr></table>${inv.notes ? `<p style="margin:0 0 24px;font-size:13px;color:#555;">${escapeHtml(inv.notes as string)}</p>` : ""}<p style="margin:0 0 24px;">${button(payUrl, `Pay ${formatMoney(inv.total_cents as number, currency)}`)}</p><p style="margin:0;font-size:13px;color:#777;">Card payments processed securely via VendoraPay. "VENDORAPAY" will appear on your statement.</p>`,
    );

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: inv.bill_to_email,
        subject: `Invoice ${inv.invoice_number} from ${businessName} — ${formatMoney(inv.total_cents as number, currency)}`,
        html,
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error("[vendorapay-invoice-send] resend error", txt);
      return json(500, { error: "email_failed", detail: txt.slice(0, 240) });
    }

    if (inv.status === "draft") {
      await admin
        .from("invoices")
        .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", invoiceId)
        .eq("status", "draft");
    }
    return json(200, { ok: true, pay_url: payUrl });
  } catch (err) {
    console.error("[vendorapay-invoice-send] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: "send_failed", detail: message.slice(0, 240) });
  }
});
