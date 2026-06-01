// Cron-driven overdue invoice reminders. Wakes up daily, finds
// invoices that crossed their due_date without being paid, and
// emails the buyer a friendly nudge. Throttled to one nudge per
// 7 days so vendors don't pester paying-soon hosts.
//
// Auth: deployed with verify_jwt=false and invoked from pg_cron via
// net.http_post — same pattern as scan-vendorapay-recurring. The
// function only acts on rows that match the overdue predicate, so
// accidental triggers just send the same email a day earlier than
// the 7-day window would have allowed. No security-sensitive surface.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { senderFrom } from "../_shared/sender.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://eventvendora.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InvoiceRow {
  id: string;
  vendor_id: string;
  slug: string;
  invoice_number: string;
  bill_to_name: string | null;
  bill_to_email: string | null;
  issue_date: string;
  due_date: string;
  total_cents: number;
  currency: string;
  reminder_sent_at: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}
function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function daysBetween(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.max(0, Math.round(ms / (24 * 3600 * 1000)));
}
function shellHtml(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px;"><tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:40px 32px;"><tr><td style="padding-bottom:24px;"><img src="https://eventvendora.com/pwa-192.png" alt="Vendora" width="44" height="44" style="display:block;border:0;border-radius:8px;" /></td></tr><tr><td style="font-size:24px;line-height:1.25;font-weight:600;padding-bottom:16px;">${title}</td></tr><tr><td style="font-size:15px;line-height:1.6;color:#3a3a3a;">${bodyHtml}</td></tr><tr><td style="padding-top:40px;border-top:1px solid #ececec;font-size:12px;color:#999999;">VendoraPay · Premium event payments</td></tr></table></td></tr></table></body></html>`;
}
function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:500;">${label}</a>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response("method", { status: 405, headers: cors });
  }
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
    if (!_cronErr && _cronOk === false) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "resend_not_configured" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const todayIso = now.toISOString().slice(0, 10);

  // The query — overdue (due_date in the past, not yet paid) AND
  // (never nudged OR last nudge > 7 days ago). PostgREST or() with
  // a comma-separated argument list expresses the throttle clause.
  //
  // Status filter MUST include both 'sent' AND 'overdue': the older
  // scan-vendorapay-payment-schedules cron runs at 08:00 UTC and
  // promotes status sent → overdue for any row past due_date. This
  // scanner then runs at 14:00 UTC. Filtering on 'sent' alone would
  // miss every invoice the earlier cron already touched — i.e.
  // every overdue invoice in practice.
  const { data: due, error: dueErr } = await (db as any)
    .from("invoices")
    .select(
      "id, vendor_id, slug, invoice_number, bill_to_name, bill_to_email, issue_date, due_date, total_cents, currency, reminder_sent_at",
    )
    .in("status", ["sent", "overdue"])
    .not("due_date", "is", null)
    .lt("due_date", todayIso)
    .not("bill_to_email", "is", null)
    .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${sevenDaysAgo.toISOString()}`)
    .order("due_date", { ascending: true })
    .limit(100);

  if (dueErr) {
    return new Response(
      JSON.stringify({ error: "scan_failed", detail: dueErr.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const dueRows = (due ?? []) as InvoiceRow[];
  let succeeded = 0;
  let failed = 0;

  for (const inv of dueRows) {
    try {
      // Resolve vendor brand + verified domain + reply-to for THIS
      // invoice. Could batch by vendor_id but the volume per tick is
      // small enough that the per-row look-ups stay cheap.
      const { data: vp } = await (db as any)
        .from("vendor_profiles")
        .select("user_id, business_name, logo_url")
        .eq("id", inv.vendor_id)
        .maybeSingle();
      const vpRow = vp as {
        user_id?: string | null;
        business_name?: string | null;
        logo_url?: string | null;
      } | null;
      // Account-wide opt-in gate: skip (and don't bill) reminders for
      // accounts that haven't enabled client email sending.
      const { data: esRow } = await (db as any)
        .from("vendor_email_settings")
        .select("sending_enabled")
        .eq("user_id", vpRow?.user_id ?? "")
        .maybeSingle();
      if (!(esRow as { sending_enabled?: boolean } | null)?.sending_enabled) continue;
      const businessName = vpRow?.business_name ?? "your vendor";
      const logoUrl = vpRow?.logo_url ?? null;

      let verifiedDomain: string | null = null;
      const { data: dom } = await (db as any)
        .from("vendor_email_domains")
        .select("domain, status")
        .eq("vendor_id", inv.vendor_id)
        .maybeSingle();
      const domRow = dom as { domain?: string; status?: string } | null;
      if (domRow?.status === "verified" && domRow.domain) {
        verifiedDomain = domRow.domain;
      }

      let vendorEmail: string | null = null;
      if (vpRow?.user_id) {
        const { data: vu } = await db.auth.admin.getUserById(vpRow.user_id);
        vendorEmail = vu?.user?.email ?? null;
      }

      const currency = inv.currency || "usd";
      const payUrl = `${APP_URL}/pay/invoice/${inv.slug}`;
      const daysLate = daysBetween(now, new Date(inv.due_date));
      const isFollowUp = !!inv.reminder_sent_at;
      // HTML-escape logoUrl (defense in depth): the column has no
      // URL-shape constraint, and a hostile vendor can poison it
      // with `x" onerror="…` via supabase-js. escapeHtml turns the
      // `"` into `&quot;` so it can't break out of the src attr.
      const logoHtml = logoUrl
        ? `<div style="margin:0 0 16px;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(businessName)}" width="44" height="44" style="display:block;border:0;border-radius:8px;object-fit:cover;" /></div>`
        : "";
      const greeting = inv.bill_to_name
        ? `Hi ${escapeHtml(inv.bill_to_name.split(/\s+/)[0])},`
        : "Hi,";
      const overdueLine = `Invoice <strong>${escapeHtml(inv.invoice_number)}</strong> from ${escapeHtml(businessName)} was due ${escapeHtml(formatDate(inv.due_date))}${
        daysLate > 0 ? ` — ${daysLate} day${daysLate === 1 ? "" : "s"} ago` : ""
      }.`;
      const intro = isFollowUp
        ? `${greeting}<br/><br/>Just a quick follow-up — ${overdueLine} If you've already paid, please disregard this note.`
        : `${greeting}<br/><br/>${overdueLine} Whenever you've got a moment, the payment link below has everything ready to go.`;
      const html = shellHtml(
        isFollowUp
          ? `Following up on invoice ${inv.invoice_number}`
          : `Friendly reminder: invoice ${inv.invoice_number}`,
        `${logoHtml}<p style="margin:0 0 24px;font-size:15px;color:#3a3a3a;">${intro}</p><p style="margin:0 0 4px;font-size:14px;">Amount due</p><p style="margin:0 0 24px;font-size:32px;font-weight:600;line-height:1.2;">${formatMoney(inv.total_cents, currency)}</p><p style="margin:0 0 24px;">${button(payUrl, `Pay ${formatMoney(inv.total_cents, currency)}`)}</p><p style="margin:0;font-size:13px;color:#777;">If you have questions about this invoice, just reply to this email — it routes back to ${escapeHtml(businessName)}.</p>`,
      );

      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: senderFrom(businessName, verifiedDomain),
          reply_to: vendorEmail ?? undefined,
          to: inv.bill_to_email,
          subject: isFollowUp
            ? `Following up: invoice ${inv.invoice_number} from ${businessName}`
            : `Reminder: invoice ${inv.invoice_number} from ${businessName} — ${formatMoney(inv.total_cents, currency)}`,
          html,
        }),
      });
      if (!r.ok) {
        const errText = await r.text();
        console.error(
          "[scan-vendorapay-overdue] resend failed",
          inv.id,
          r.status,
          errText.slice(0, 240),
        );
        failed++;
        continue;
      }

      // Stamp the row AFTER the email lands. If the UPDATE fails the
      // buyer has the email but we'll re-nudge in ≤24h on the next
      // tick (since reminder_sent_at stays null/old) — annoying but
      // not destructive. Loud log for ops visibility.
      const { error: updErr } = await (db as any)
        .from("invoices")
        .update({ reminder_sent_at: now.toISOString() })
        .eq("id", inv.id);
      if (updErr) {
        console.error(
          "[scan-vendorapay-overdue] reminder_sent_at stamp failed",
          inv.id,
          updErr,
        );
      }
      succeeded++;
    } catch (err) {
      console.error("[scan-vendorapay-overdue] row threw", inv.id, err);
      failed++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: dueRows.length, succeeded, failed }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
