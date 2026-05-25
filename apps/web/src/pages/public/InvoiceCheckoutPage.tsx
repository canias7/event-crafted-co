// VendoraPay public invoice checkout. Hosts land here from the email
// the vendor sent (/pay/invoice/<slug>). No auth required.
//
// Shows the full invoice (vendor brand, bill-to, line items, totals)
// and a single Pay button that calls vendorapay-invoice-checkout to
// mint a Stripe Checkout Session and redirect.

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Check, CreditCard, Loader2 } from "lucide-react";
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
        <Centered title="Invoice not found" sub="This invoice doesn't exist, has been cancelled, or hasn't been sent yet." />
      </Shell>
    );
  }

  if (flow === "success") {
    return (
      <Shell>
        <Centered
          icon={<Check className="w-7 h-7 text-emerald-600" />}
          title="Payment received"
          sub={`Thanks. ${invoice.vendor_business_name ?? "Your vendor"} will be in touch.`}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="max-w-xl mx-auto px-4 py-12">
        {/* Vendor brand */}
        <div className="flex items-center gap-3 mb-8">
          {invoice.vendor_logo_url ? (
            <img
              src={invoice.vendor_logo_url}
              alt={invoice.vendor_business_name ?? ""}
              className="w-12 h-12 rounded-full object-cover ring-1 ring-foreground/10"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-foreground/5 inline-flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              {invoice.vendor_business_name ?? "VendoraPay"}
            </div>
            <div className="text-[11px] text-muted-foreground">Powered by VendoraPay</div>
          </div>
        </div>

        <div
          className="rounded-2xl p-6 mb-4"
          style={{
            background: "rgba(255,253,250,0.7)",
            border: "0.5px solid rgba(255,138,76,0.22)",
          }}
        >
          {/* Header */}
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                Invoice
              </div>
              <div className="text-xl font-editorial mt-0.5">{invoice.invoice_number}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                Amount due
              </div>
              <div className="text-2xl font-editorial mt-0.5">
                {formatMoney(invoice.total_cents, invoice.currency)}
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold">Issued</div>
              <div className="text-foreground mt-0.5">{formatDate(invoice.issue_date)}</div>
            </div>
            {invoice.due_date ? (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold">Due</div>
                <div className="text-foreground mt-0.5">{formatDate(invoice.due_date)}</div>
              </div>
            ) : null}
          </div>

          {invoice.bill_to_name || invoice.bill_to_email ? (
            <div className="text-xs mb-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Bill to
              </div>
              <div className="text-foreground mt-0.5">
                {invoice.bill_to_name}
                {invoice.bill_to_name && invoice.bill_to_email ? " · " : ""}
                {invoice.bill_to_email}
              </div>
            </div>
          ) : null}

          {/* Line items */}
          <div className="border-t border-foreground/10 pt-4 mt-2">
            {invoice.line_items.map((li, idx) => (
              <div
                key={idx}
                className={`flex items-start justify-between gap-3 py-2 ${idx > 0 ? "border-t border-foreground/5" : ""}`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{li.name}</div>
                  {li.description ? (
                    <div className="text-[11px] text-muted-foreground">{li.description}</div>
                  ) : null}
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {li.qty} × {formatMoney(li.unit_price_cents, invoice.currency)}
                  </div>
                </div>
                <div className="text-sm font-medium">
                  {formatMoney(li.total_cents ?? li.qty * li.unit_price_cents, invoice.currency)}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-foreground/10 mt-3 pt-3 space-y-1 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatMoney(invoice.subtotal_cents, invoice.currency)}</span>
            </div>
            {invoice.tax_cents > 0 ? (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Tax ({(invoice.tax_rate_bps / 100).toFixed(2)}%)</span>
                <span>{formatMoney(invoice.tax_cents, invoice.currency)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between font-semibold pt-1 border-t border-foreground/5">
              <span>Total</span>
              <span>{formatMoney(invoice.total_cents, invoice.currency)}</span>
            </div>
          </div>

          {invoice.notes ? (
            <p className="text-xs text-muted-foreground mt-4 whitespace-pre-wrap">
              {invoice.notes}
            </p>
          ) : null}
        </div>

        <Button
          onClick={handlePay}
          disabled={paying}
          className="w-full rounded-full h-12 text-base"
        >
          {paying ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <CreditCard className="w-4 h-4 mr-2" />
          )}
          Pay {formatMoney(invoice.total_cents, invoice.currency)}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Card payments processed securely. "VENDORAPAY" will appear on your statement.
        </p>
      </div>
    </Shell>
  );
}

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
  sub: string;
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
