// VendoraPay public invoice checkout. Hosts land here from the email
// the vendor sent (/pay/invoice/<slug>). No auth required.
//
// Renders a professional, print-ready invoice document — vendor brand
// at the top, bill-to + meta side-by-side, line items in a clean
// table, totals, terms. A "Save as PDF" button kicks off the browser
// print dialog (with print CSS that hides nav and the pay CTA, so
// the printout is just the document itself). The Pay button stays
// on-screen for the recipient.

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Check, CreditCard, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizeInvoiceLineItems } from "@/lib/invoiceLineItems";
import { Button } from "@/components/ui/button";

interface LineItem {
  name: string;
  description?: string | null;
  qty: number;
  unit_price_cents: number;
  total_cents?: number;
}

interface InvoiceDetails {
  id: string;
  vendor_id: string;
  invoice_number: string;
  bill_to_name: string | null;
  bill_to_email: string | null;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  line_items: LineItem[];
  subtotal_cents: number;
  tax_rate_bps: number;
  tax_cents: number;
  total_cents: number;
  /** Vendor-added late fee, baked into total_cents. Rendered as
   *  its own line so the buyer sees the breakdown adds up. */
  late_fee_cents?: number | null;
  currency: string;
  status: string;
  vendor_business_name: string | null;
  vendor_logo_url: string | null;
  // Best-effort: whether the vendor's payments are set up. Cached; the
  // checkout function re-verifies live on Pay, so we only use this for a
  // soft heads-up (we don't disable Pay on it).
  vendor_can_accept?: boolean;
}

function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

// `locale` is "en-US" in English (as before) and "es-US" in Spanish.
// Money stays en-US in both: "$1,234.50" is also how US Spanish writes it.
function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Checkout-start failures. English shows the server's text as before;
// Spanish gets a translated line (checkout.json → startError), with
// its own wording for the server errors a payer can actually hit.
const START_ERRORS = new Map([
  ["vendor not ready to receive payments", "vendorNotReady"],
  ["rate_limited", "rateLimited"],
]);

function startErrorDetail(t: TFunction, detail: string | null): string {
  if (detail === null) return t("startError.tryAgain");
  return t(`startError.${START_ERRORS.get(detail) ?? "detail"}`, { detail });
}

export default function InvoiceCheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const flow = searchParams.get("status");
  const { t, i18n } = useTranslation("checkout");
  const dateLocale = i18n.resolvedLanguage === "es" ? "es-US" : "en-US";

  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!slug) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_invoice_for_checkout", {
        p_slug: slug,
      });
      if (cancelled) return;
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setInvoice(row as InvoiceDetails);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handlePay = useCallback(async () => {
    if (!slug || paying) return;
    setPaying(true);
    const { data, error } = await supabase.functions.invoke("vendorapay-invoice-checkout", {
      body: { slug },
    });
    if (error || !(data as { url?: string })?.url) {
      // null = nothing from the server ("Try again in a moment.").
      let detail: string | null = null;
      const ctx = (error as { context?: Response } | null)?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.clone().json();
          detail = (body?.detail || body?.error || error?.message) ?? detail;
        } catch {
          detail = error?.message ?? detail;
        }
      } else if (error?.message) {
        detail = error.message;
      }
      toast.error(t("startError.title"), {
        description: startErrorDetail(t, detail),
      });
      setPaying(false);
      return;
    }
    window.location.href = (data as { url: string }).url;
  }, [slug, paying, t]);

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (notFound || !invoice) {
    return (
      <Shell>
        <Centered
          title={t("invoice.notFound.title")}
          sub={t("invoice.notFound.body")}
        />
      </Shell>
    );
  }

  if (flow === "success" || invoice.status === "paid") {
    const amountPaid = formatMoney(invoice.total_cents, invoice.currency);
    const vendorName = invoice.vendor_business_name ?? t("invoice.paid.yourVendor");
    return (
      <Shell>
        <Centered
          icon={<Check className="w-7 h-7 text-accent" />}
          title={t("invoice.paid.title")}
          sub={
            <span>
              <Trans
                t={t}
                i18nKey={
                  invoice.invoice_number
                    ? "invoice.paid.bodyNumber"
                    : "invoice.paid.bodyNoNumber"
                }
                components={{
                  amount: (
                    <strong className="font-semibold text-foreground">{amountPaid}</strong>
                  ),
                  number: (
                    <span className="font-medium text-foreground">
                      {invoice.invoice_number}
                    </span>
                  ),
                  email: (
                    <span className="font-medium text-foreground">
                      {invoice.bill_to_email ?? t("invoice.paid.yourEmail")}
                    </span>
                  ),
                  vendor: <>{vendorName}</>,
                }}
              />
            </span>
          }
        />
      </Shell>
    );
  }

  if (invoice.status === "cancelled") {
    return (
      <Shell>
        <Centered
          title={t("invoice.cancelled.title")}
          sub={t("invoice.cancelled.body", {
            vendor: invoice.vendor_business_name ?? t("invoice.cancelled.theVendor"),
          })}
        />
      </Shell>
    );
  }

  if (invoice.status === "draft") {
    return (
      <Shell>
        <Centered
          title={t("invoice.draft.title")}
          sub={t("invoice.draft.body")}
        />
      </Shell>
    );
  }

  if (invoice.status === "refunded" || invoice.status === "partial_refund") {
    return (
      <Shell>
        <Centered
          title={t("invoice.refunded.title")}
          sub={t("invoice.refunded.body", {
            vendor: invoice.vendor_business_name ?? t("invoice.refunded.yourVendor"),
          })}
        />
      </Shell>
    );
  }

  const businessName = invoice.vendor_business_name ?? "VendoraPay";
  const totalDue = formatMoney(invoice.total_cents, invoice.currency);

  return (
    <Shell>
      {/* Print CSS — strips the page background + action bar so the
          printout is just the document itself; sets clean page margins. */}
      <style>{PRINT_CSS}</style>

      {/* Action bar (hidden on print). Print/PDF on the left, Pay on
          the right. Both feel like first-class actions on the page. */}
      <div className="print:hidden sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-foreground/5">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-3 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => window.print()}
            className="rounded-full"
            size="sm"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {t("invoice.savePdf")}
          </Button>
          <Button
            onClick={handlePay}
            disabled={paying}
            className="rounded-full"
            size="sm"
          >
            {paying ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <CreditCard className="w-3.5 h-3.5 mr-1.5" />
            )}
            {t("invoice.pay", { amount: totalDue })}
          </Button>
        </div>
        {invoice.vendor_can_accept === false ? (
          <div className="max-w-3xl mx-auto px-5 sm:px-8 pb-3 -mt-1">
            <p className="text-[12px] text-accent bg-pending border border-accent/25 rounded-lg px-3 py-2">
              {t("invoice.headsUp")}
            </p>
          </div>
        ) : null}
      </div>

      {/* Document — A4-friendly width, white card on the canvas. */}
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8 print:py-0 print:px-0 print:max-w-none">
        <article
          className="invoice-doc bg-white rounded-2xl print:rounded-none shadow-[0_24px_60px_-30px_rgba(26,20,16,0.25)] print:shadow-none p-8 sm:p-12 print:p-0"
          style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}
        >
          {/* Header — vendor brand on the left, INVOICE block on the right */}
          <header className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight truncate">{businessName}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("invoice.issuedVia")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                {t("invoice.label")}
              </p>
              <p className="text-2xl font-editorial mt-0.5 tabular-nums">
                {invoice.invoice_number || "—"}
              </p>
            </div>
          </header>

          <hr className="my-8 border-foreground/10" />

          {/* Bill-to and meta side by side */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                {t("invoice.billTo")}
              </p>
              <p className="text-sm font-medium mt-1">
                {invoice.bill_to_name ?? "—"}
              </p>
              {invoice.bill_to_email ? (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {invoice.bill_to_email}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("invoice.issued")}
                </p>
                <p className="mt-1">{formatDate(invoice.issue_date, dateLocale)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("invoice.due")}
                </p>
                <p className="mt-1">{formatDate(invoice.due_date, dateLocale)}</p>
              </div>
            </div>
          </section>

          {/* Line items table */}
          <section className="mt-10">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-foreground/15">
                  <th className="py-2.5 pr-2 font-semibold">{t("invoice.table.item")}</th>
                  <th className="py-2.5 px-2 font-semibold text-right w-16">{t("invoice.table.qty")}</th>
                  <th className="py-2.5 px-2 font-semibold text-right w-28">{t("invoice.table.unitPrice")}</th>
                  <th className="py-2.5 pl-2 font-semibold text-right w-28">{t("invoice.table.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {normalizeInvoiceLineItems(invoice.line_items).map((li, idx) => (
                  <tr key={idx} className="border-b border-foreground/5 align-top">
                    <td className="py-3 pr-2">
                      <div className="font-medium">{li.name}</div>
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums">{li.qty}</td>
                    <td className="py-3 px-2 text-right tabular-nums">
                      {formatMoney(li.unit_price_cents, invoice.currency)}
                    </td>
                    <td className="py-3 pl-2 text-right tabular-nums font-medium">
                      {formatMoney(li.total_cents, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Totals — right-aligned, with Total Due emphasized */}
          <section className="mt-6 flex justify-end">
            <div className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{t("invoice.subtotal")}</span>
                <span className="tabular-nums">
                  {formatMoney(invoice.subtotal_cents, invoice.currency)}
                </span>
              </div>
              {invoice.tax_cents > 0 ? (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>
                    {t("invoice.tax", { rate: (invoice.tax_rate_bps / 100).toFixed(2) })}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(invoice.tax_cents, invoice.currency)}
                  </span>
                </div>
              ) : null}
              {invoice.late_fee_cents && invoice.late_fee_cents > 0 ? (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{t("invoice.lateFee")}</span>
                  <span className="tabular-nums">
                    {formatMoney(invoice.late_fee_cents, invoice.currency)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between pt-2 mt-1 border-t border-foreground/15">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("invoice.totalDue")}
                </span>
                <span className="text-lg font-editorial tabular-nums">
                  {totalDue}
                </span>
              </div>
            </div>
          </section>

          {/* Notes / terms */}
          {invoice.notes ? (
            <section className="mt-10">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                {t("invoice.notes")}
              </p>
              <p className="text-sm text-foreground mt-1 whitespace-pre-wrap leading-relaxed">
                {invoice.notes}
              </p>
            </section>
          ) : null}

          {/* Footer */}
          <footer className="mt-12 pt-6 border-t border-foreground/10 flex items-center justify-between gap-4 flex-wrap text-[11px] text-muted-foreground">
            <span>{t("invoice.thanks")}</span>
            <span>
              <Trans
                t={t}
                i18nKey="invoice.poweredBy"
                components={{
                  brand: <span className="font-semibold text-foreground" />,
                }}
              />
            </span>
          </footer>
        </article>

        <p className="text-[11px] text-muted-foreground text-center mt-6 print:hidden">
          {t("invoice.statement")}
        </p>
      </div>
    </Shell>
  );
}

const PRINT_CSS = `
@media print {
  @page { size: Letter; margin: 0.5in; }
  html, body { background: white !important; }
  .invoice-doc { box-shadow: none !important; border: none !important; }
}
`;

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen vendor-canvas">{children}</div>;
}

function Centered({
  icon,
  title,
  sub,
}: {
  icon?: React.ReactNode;
  title: string;
  sub: React.ReactNode;
}) {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      {icon ? (
        <div className="w-14 h-14 rounded-full bg-pending inline-flex items-center justify-center mb-4">
          {icon}
        </div>
      ) : null}
      <h1 className="font-editorial text-2xl">{title}</h1>
      <p className="text-sm text-muted-foreground mt-2">{sub}</p>
    </div>
  );
}
