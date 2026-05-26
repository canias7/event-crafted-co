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
import { Check, CreditCard, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
  currency: string;
  status: string;
  vendor_business_name: string | null;
  vendor_logo_url: string | null;
}

function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function InvoiceCheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const flow = searchParams.get("status");

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
      let detail = "Try again in a moment.";
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
      toast.error("Couldn't start checkout", { description: detail });
      setPaying(false);
      return;
    }
    window.location.href = (data as { url: string }).url;
  }, [slug, paying]);

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
        <Centered title="Invoice not found" sub="This invoice doesn't exist." />
      </Shell>
    );
  }

  if (flow === "success" || invoice.status === "paid") {
    const amountPaid = formatMoney(invoice.total_cents, invoice.currency);
    const vendorName = invoice.vendor_business_name ?? "Your vendor";
    return (
      <Shell>
        <Centered
          icon={<Check className="w-7 h-7 text-emerald-600" />}
          title="Payment received"
          sub={
            <span>
              You paid{" "}
              <strong className="font-semibold text-foreground">{amountPaid}</strong>{" "}
              {invoice.invoice_number ? (
                <>
                  for Invoice{" "}
                  <span className="font-medium text-foreground">
                    {invoice.invoice_number}
                  </span>
                  .{" "}
                </>
              ) : (
                ". "
              )}
              A receipt is on its way to{" "}
              <span className="font-medium text-foreground">
                {invoice.bill_to_email ?? "your email"}
              </span>
              . {vendorName} will be in touch — funds settle to their account
              within 2 business days.
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
          title="Invoice cancelled"
          sub={`${invoice.vendor_business_name ?? "The vendor"} cancelled this invoice. Please reach out if you have questions.`}
        />
      </Shell>
    );
  }

  if (invoice.status === "draft") {
    return (
      <Shell>
        <Centered
          title="Invoice not yet ready"
          sub="This invoice hasn't been sent yet. Check back once your vendor finalizes it."
        />
      </Shell>
    );
  }

  if (invoice.status === "refunded" || invoice.status === "partial_refund") {
    return (
      <Shell>
        <Centered
          title="Already refunded"
          sub={`${invoice.vendor_business_name ?? "Your vendor"} has refunded this invoice.`}
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
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => window.print()}
            className="rounded-full"
            size="sm"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Save as PDF
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
            Pay {totalDue}
          </Button>
        </div>
      </div>

      {/* Document — A4-friendly width, white card on the canvas. */}
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 print:py-0 print:px-0 print:max-w-none">
        <article
          className="invoice-doc bg-white rounded-2xl print:rounded-none shadow-[0_24px_60px_-30px_rgba(26,20,16,0.25)] print:shadow-none p-8 sm:p-12 print:p-0"
          style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}
        >
          {/* Header — vendor brand on the left, INVOICE block on the right */}
          <header className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              {invoice.vendor_logo_url ? (
                <img
                  src={invoice.vendor_logo_url}
                  alt={businessName}
                  className="w-14 h-14 rounded-full object-cover ring-1 ring-foreground/10 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-foreground/5 inline-flex items-center justify-center shrink-0">
                  <CreditCard className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight truncate">{businessName}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Issued via VendoraPay
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                Invoice
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
                Bill to
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
                  Issued
                </p>
                <p className="mt-1">{formatDate(invoice.issue_date)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Due
                </p>
                <p className="mt-1">{formatDate(invoice.due_date)}</p>
              </div>
            </div>
          </section>

          {/* Line items table */}
          <section className="mt-10">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-foreground/15">
                  <th className="py-2.5 pr-2 font-semibold">Item</th>
                  <th className="py-2.5 px-2 font-semibold text-right w-16">Qty</th>
                  <th className="py-2.5 px-2 font-semibold text-right w-28">Unit price</th>
                  <th className="py-2.5 pl-2 font-semibold text-right w-28">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.map((li, idx) => (
                  <tr key={idx} className="border-b border-foreground/5 align-top">
                    <td className="py-3 pr-2">
                      <div className="font-medium">{li.name}</div>
                      {li.description ? (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {li.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums">{li.qty}</td>
                    <td className="py-3 px-2 text-right tabular-nums">
                      {formatMoney(li.unit_price_cents, invoice.currency)}
                    </td>
                    <td className="py-3 pl-2 text-right tabular-nums font-medium">
                      {formatMoney(
                        li.total_cents ?? li.qty * li.unit_price_cents,
                        invoice.currency,
                      )}
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
                <span>Subtotal</span>
                <span className="tabular-nums">
                  {formatMoney(invoice.subtotal_cents, invoice.currency)}
                </span>
              </div>
              {invoice.tax_cents > 0 ? (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Tax ({(invoice.tax_rate_bps / 100).toFixed(2)}%)</span>
                  <span className="tabular-nums">
                    {formatMoney(invoice.tax_cents, invoice.currency)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between pt-2 mt-1 border-t border-foreground/15">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Total due
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
                Notes
              </p>
              <p className="text-sm text-foreground/80 mt-1 whitespace-pre-wrap leading-relaxed">
                {invoice.notes}
              </p>
            </section>
          ) : null}

          {/* Footer */}
          <footer className="mt-12 pt-6 border-t border-foreground/10 flex items-center justify-between gap-4 flex-wrap text-[11px] text-muted-foreground">
            <span>Thank you for your business.</span>
            <span>
              Powered by <span className="font-semibold text-foreground/70">VendoraPay</span>
            </span>
          </footer>
        </article>

        <p className="text-[11px] text-muted-foreground text-center mt-6 print:hidden">
          Card payments processed securely. &quot;VENDORAPAY&quot; will appear on your statement.
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
        <div className="w-14 h-14 rounded-full bg-emerald-50 inline-flex items-center justify-center mb-4">
          {icon}
        </div>
      ) : null}
      <h1 className="font-editorial text-2xl">{title}</h1>
      <p className="text-sm text-muted-foreground mt-2">{sub}</p>
    </div>
  );
}
