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
// ${SUPABASE_SERVICE_ROLE_KEY} on every call. This endpoint MUST run
// with verify_jwt=false (set in supabase/config.toml) BUT enforces
// the service-role bearer manually (see handler below) so anonymous
// callers can't spoof "$X received" emails impersonating any vendor.
// NOTE: the service-role key is now the sb_secret_ format (not a JWT),
// so leaving verify_jwt=true makes the gateway 401 the caller before
// this self-auth check runs — silently killing receipt emails.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { senderFrom } from "../_shared/sender.ts";

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

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  opts: { from?: string; replyTo?: string } = {},
): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("[vendorapay-notify] RESEND_API_KEY not set; skipping email", to);
    return false;
  }
  const payload = JSON.stringify({
    from: opts.from ?? FROM_ADDRESS,
    to,
    subject,
    html,
    reply_to: opts.replyTo,
  });

  // Retry the Resend POST a few times with exponential backoff so a
  // transient blip (network drop, brief 5xx) doesn't silently lose
  // the buyer receipt. Resend's typical SLA recovers within a few
  // hundred ms — 3 attempts spread over ~2.6s catches most of them.
  // Skip retry on 4xx (caller mistake — won't get better) but retry
  // on 5xx and network failures.
  const delays = [200, 600, 1800];
  let lastErr: string | null = null;
  for (let attempt = 0; attempt < delays.length + 1; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt - 1]));
    }
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: payload,
      });
      if (r.ok) return true;
      const body = await r.text();
      lastErr = `${r.status} ${body.slice(0, 200)}`;
      if (r.status < 500 && r.status !== 429) {
        // 4xx (other than rate limit) — won't recover. Log + bail.
        console.error("[vendorapay-notify] resend 4xx (no retry)", to, lastErr);
        return false;
      }
      console.warn(
        "[vendorapay-notify] resend transient",
        attempt + 1,
        to,
        lastErr,
      );
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.warn("[vendorapay-notify] resend network error", attempt + 1, to, lastErr);
    }
  }
  console.error("[vendorapay-notify] resend FAILED after retries", to, lastErr);
  return false;
}

// senderFrom() lives in _shared/sender.ts so vendorapay-invoice-send
// can use the same logic — keeps the From header identical on the
// initial invoice email and the post-payment receipt.

interface PaymentReceivedPayload {
  kind: "payment_received";
  vendor_id: string;
  amount_cents: number;
  currency: string;
  description: string;
  host_email?: string | null;
  payment_link_id?: string | null;
  proposal_id?: string | null;
  invoice_id?: string | null;
}

interface InvoiceLineItem {
  name: string;
  qty: number;
  unit_price_cents: number;
  total_cents?: number;
}

interface InvoiceContext {
  number: string | null;
  slug: string | null;
  lineItems: InvoiceLineItem[];
  subtotal_cents: number;
  tax_rate_bps: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  // Service-role bearer required (matches what vendorapay-webhook
  // sends). Anything else is a spoof attempt — log and drop. The
  // length>0 guard prevents a `Bearer undefined` request from
  // matching when the env var is somehow unset.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (
    SUPABASE_SERVICE_ROLE_KEY.length === 0 ||
    authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
  ) {
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
      .select("user_id, business_name, logo_url, location, default_tax_pct")
      .eq("id", body.vendor_id)
      .maybeSingle();
    const vpRow = vp as {
      user_id?: string | null;
      business_name?: string | null;
      logo_url?: string | null;
      location?: string | null;
      default_tax_pct?: number | null;
    } | null;
    const businessName = vpRow?.business_name ?? "Your business";
    const logoUrl = vpRow?.logo_url ?? null;
    const businessLocation = vpRow?.location ?? null;
    // Vendor's account email — used as Reply-To so buyer replies
    // route to the vendor's inbox (Resend From stays on the
    // verified domain).
    let vendorEmail: string | null = null;
    if (vpRow?.user_id) {
      const { data: vu } = await db.auth.admin.getUserById(vpRow.user_id);
      vendorEmail = vu?.user?.email ?? null;
    }

    // Vendor's verified sending domain (if they've hooked one up
    // via vendorapay-email-domain). When status='verified' we use
    // noreply@<their-domain> as the From; otherwise we fall back
    // to the platform's invoices@eventvendora.com.
    let verifiedDomain: string | null = null;
    const { data: dom } = await db
      .from("vendor_email_domains")
      .select("domain, status")
      .eq("vendor_id", body.vendor_id)
      .maybeSingle();
    const domRow = dom as { domain?: string; status?: string } | null;
    if (domRow?.status === "verified" && domRow.domain) {
      verifiedDomain = domRow.domain;
    }

    // Pull the actual invoice (line items, totals, slug) if the
    // payment came through an invoice. Pay-link payments don't
    // have one — we fall back to a single-line synthesized row
    // using the description + amount.
    let invoiceCtx: InvoiceContext | null = null;
    if (body.invoice_id) {
      const { data: inv } = await db
        .from("invoices")
        .select(
          "invoice_number, slug, line_items, subtotal_cents, tax_rate_bps, tax_cents, total_cents, notes",
        )
        .eq("id", body.invoice_id)
        .maybeSingle();
      const iRow = inv as {
        invoice_number?: string | null;
        slug?: string | null;
        line_items?: InvoiceLineItem[];
        subtotal_cents?: number;
        tax_rate_bps?: number;
        tax_cents?: number;
        total_cents?: number;
        notes?: string | null;
      } | null;
      if (iRow) {
        invoiceCtx = {
          number: iRow.invoice_number ?? null,
          slug: iRow.slug ?? null,
          lineItems: Array.isArray(iRow.line_items) ? iRow.line_items : [],
          subtotal_cents: iRow.subtotal_cents ?? body.amount_cents,
          tax_rate_bps: iRow.tax_rate_bps ?? 0,
          tax_cents: iRow.tax_cents ?? 0,
          total_cents: iRow.total_cents ?? body.amount_cents,
          notes: iRow.notes ?? null,
        };
      }
    }

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
      // Pack richer context into the admin notification so the
      // bell-badge preview ("$X received — INV-0042 from buyer@…")
      // tells the vendor what happened without having to click in.
      const invoiceLabel = invoiceCtx?.number
        ? `Invoice ${invoiceCtx.number}`
        : null;
      const buyerLabel = body.host_email ?? null;
      const notifBodyBits = [
        body.description,
        invoiceLabel && invoiceLabel !== body.description ? invoiceLabel : null,
        buyerLabel ? `from ${buyerLabel}` : null,
      ].filter(Boolean) as string[];
      const notifBody = notifBodyBits.join(" · ");

      const notifRows = adminRows.map((m) => ({
        user_id: m.user_id,
        type: "vendorapay_payment_received",
        title: `${amount} received`,
        body: notifBody,
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
        const invoiceLine = invoiceLabel
          ? `<p style="margin:0 0 16px;font-size:13px;color:#6b6259;">${escapeHtml(invoiceLabel)}</p>`
          : "";
        const html = shellHtml(
          `${amount} arrived in VendoraPay`,
          `<p style="margin:0 0 16px;">Good news — a payment of <strong>${amount}</strong> just landed in your ${escapeHtml(businessName)} account ${fromCopy}.</p>
           ${invoiceLine}
           <p style="margin:0 0 24px;color:#3a3a3a;">${escapeHtml(body.description)}</p>
           <p style="margin:0 0 24px;">${button(link, "Open VendoraPay")}</p>
           <p style="margin:0;font-size:13px;color:#777;">Funds settle to your bank in 2 business days.</p>`,
        );
        const subjectSuffix = invoiceLabel ? ` — ${invoiceLabel}` : "";
        await sendEmail(
          email,
          `${amount} received${subjectSuffix} — ${body.description}`,
          html,
        );
      }
    }

    // 2) Buyer — branded paid invoice. Uses the vendor's saved
    //    template (logo / business name / city / tax rate) plus the
    //    actual line items from the sale. From-name is the vendor's
    //    business so the buyer's inbox shows their brand; replies
    //    route to the vendor's account email via Reply-To.
    if (body.host_email) {
      const paidAt = new Date().toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      });
      const taxPct = invoiceCtx
        ? (invoiceCtx.tax_rate_bps / 100).toFixed(2)
        : Number(vpRow?.default_tax_pct ?? 0).toFixed(2);
      const lineItems: InvoiceLineItem[] = invoiceCtx?.lineItems?.length
        ? invoiceCtx.lineItems
        : [{
            name: body.description || "Payment",
            qty: 1,
            unit_price_cents: body.amount_cents,
            total_cents: body.amount_cents,
          }];
      const subtotalCents = invoiceCtx?.subtotal_cents ?? body.amount_cents;
      const taxCents = invoiceCtx?.tax_cents ?? 0;
      const totalCents = invoiceCtx?.total_cents ?? body.amount_cents;
      const invoiceNumber = invoiceCtx?.number ?? "—";
      const hostedInvoiceUrl = invoiceCtx?.slug
        ? `${APP_URL}/pay/invoice/${invoiceCtx.slug}`
        : null;
      const notes = invoiceCtx?.notes ?? null;

      const lineRowsHtml = lineItems.map((li) => {
        const total = li.total_cents ?? li.qty * li.unit_price_cents;
        return `<tr>
          <td style="padding:10px 6px 10px 0;font-size:13px;color:#1a1a1a;border-bottom:1px solid #f0eeeb;">${escapeHtml(li.name)}</td>
          <td style="padding:10px 6px;font-size:13px;color:#1a1a1a;text-align:right;font-variant-numeric:tabular-nums;border-bottom:1px solid #f0eeeb;">${li.qty}</td>
          <td style="padding:10px 6px;font-size:13px;color:#1a1a1a;text-align:right;font-variant-numeric:tabular-nums;border-bottom:1px solid #f0eeeb;">${formatMoney(li.unit_price_cents, body.currency)}</td>
          <td style="padding:10px 0 10px 6px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;font-variant-numeric:tabular-nums;border-bottom:1px solid #f0eeeb;">${formatMoney(total, body.currency)}</td>
        </tr>`;
      }).join("");

      const taxRowHtml = taxCents > 0
        ? `<tr>
            <td style="padding:4px 0;font-size:13px;color:#6b6259;">Tax (${taxPct}%)</td>
            <td style="padding:4px 0;font-size:13px;color:#6b6259;text-align:right;font-variant-numeric:tabular-nums;">${formatMoney(taxCents, body.currency)}</td>
          </tr>`
        : "";

      const notesHtml = notes
        ? `<div style="margin:24px 0 0;padding-top:16px;border-top:1px solid #f0eeeb;">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.22em;color:#6b6259;text-transform:uppercase;">Notes</p>
            <p style="margin:0;font-size:13px;color:#3a342f;line-height:1.6;white-space:pre-wrap;">${escapeHtml(notes)}</p>
          </div>`
        : "";

      const ctaHtml = hostedInvoiceUrl
        ? `<p style="margin:24px 0 0;">${button(hostedInvoiceUrl, "View invoice online")}</p>`
        : "";

      // HTML-escape logoUrl (defense in depth): the column has no
      // URL-shape constraint, and a hostile vendor can poison it
      // with `x" onerror="…` via supabase-js. escapeHtml turns the
      // `"` into `&quot;` so it can't break out of the src attr.
      const logoHtml = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(businessName)}" width="48" height="48" style="display:block;border:0;border-radius:999px;object-fit:cover;" />`
        : `<div style="width:48px;height:48px;border-radius:999px;background:#f0eeeb;display:inline-block;"></div>`;

      const html = shellHtml(
        "Payment received",
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
          <tr>
            <td style="vertical-align:middle;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:12px;">${logoHtml}</td>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;font-size:16px;font-weight:600;color:#1a1410;">${escapeHtml(businessName)}</p>
                    ${businessLocation ? `<p style="margin:2px 0 0;font-size:12px;color:#6b6259;">${escapeHtml(businessLocation)}</p>` : ""}
                  </td>
                </tr>
              </table>
            </td>
            <td style="vertical-align:top;text-align:right;">
              <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#dcf2e2;color:#0a7c4a;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Paid</span>
              <p style="margin:6px 0 0;font-size:11px;color:#6b6259;letter-spacing:0.18em;text-transform:uppercase;">Invoice ${escapeHtml(invoiceNumber)}</p>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px 6px 8px 0;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#6b6259;border-bottom:1px solid #d8d2cb;">Item</th>
              <th style="text-align:right;padding:8px 6px;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#6b6259;border-bottom:1px solid #d8d2cb;">Qty</th>
              <th style="text-align:right;padding:8px 6px;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#6b6259;border-bottom:1px solid #d8d2cb;">Unit</th>
              <th style="text-align:right;padding:8px 0 8px 6px;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#6b6259;border-bottom:1px solid #d8d2cb;">Amount</th>
            </tr>
          </thead>
          <tbody>${lineRowsHtml}</tbody>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
          <tr>
            <td style="text-align:right;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-block;min-width:240px;">
                <tr>
                  <td style="padding:4px 12px 4px 0;font-size:13px;color:#6b6259;">Subtotal</td>
                  <td style="padding:4px 0;font-size:13px;color:#6b6259;text-align:right;font-variant-numeric:tabular-nums;">${formatMoney(subtotalCents, body.currency)}</td>
                </tr>
                ${taxRowHtml}
                <tr>
                  <td style="padding:10px 12px 0 0;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#1e2840;border-top:2px solid #1e2840;">Total paid</td>
                  <td style="padding:10px 0 0;font-size:18px;font-weight:700;color:#1e2840;text-align:right;font-variant-numeric:tabular-nums;border-top:2px solid #1e2840;">${formatMoney(totalCents, body.currency)}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 6px;font-size:13px;color:#6b6259;">Paid on ${escapeHtml(paidAt)}</p>
        <p style="margin:0;font-size:13px;color:#6b6259;">"VENDORAPAY" will appear on your card statement.</p>

        ${notesHtml}
        ${ctaHtml}

        <p style="margin:24px 0 0;font-size:12px;color:#6b6259;">Questions about this charge? Reply to this email — it goes straight to ${escapeHtml(businessName)}.</p>`,
      );
      await sendEmail(
        body.host_email,
        invoiceCtx?.number
          ? `Receipt from ${businessName} — Invoice ${invoiceCtx.number} (${amount})`
          : `Receipt from ${businessName} — ${amount}`,
        html,
        {
          from: senderFrom(businessName, verifiedDomain),
          // Falls back to FROM_ADDRESS if the vendor has no
          // account email on file (shouldn't happen — vendors must
          // sign in — but defensive).
          replyTo: vendorEmail ?? undefined,
        },
      );
    }

    return json(200, { ok: true, admins_notified: adminRows.length, host_emailed: Boolean(body.host_email) });
  } catch (err) {
    console.error("[vendorapay-notify] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: "notify_failed", detail: message.slice(0, 240) });
  }
});
