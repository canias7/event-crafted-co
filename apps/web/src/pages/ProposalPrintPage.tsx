import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, AlertCircle, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/format";

// Print-friendly view of a single proposal. RLS gates access — only
// the host and vendor on the inquiry can read it. Auto-fires the
// print dialog on mount; users can save-to-PDF from there. Lives at
// /proposals/:id/print so it can open in a new tab without
// disturbing the parent page.

interface LineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
}

interface ProposalRow {
  id: string;
  title: string;
  line_items: LineItem[];
  subtotal_cents: number;
  deposit_cents: number | null;
  terms: string | null;
  contract_body: string | null;
  status: string;
  sent_at: string | null;
  vendor: { business_name: string; location: string | null } | null;
  inquiry: { event_type: string; event_date: string | null } | null;
}

export default function ProposalPrintPage() {
  const { id } = useParams();
  const [data, setData] = useState<ProposalRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row, error: err } = await (supabase as any)
        .from("proposals")
        .select(
          "id, title, line_items, subtotal_cents, deposit_cents, terms, contract_body, status, sent_at, vendor:vendor_profiles(business_name, location), inquiry:inquiries(event_type, event_date)",
        )
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (err || !row) {
        setError(err?.message ?? "Proposal not found.");
        return;
      }
      setData(row as ProposalRow);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Auto-trigger the print dialog once data renders. Wrap in setTimeout
  // so the layout has time to settle.
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [data]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
        <h1 className="font-editorial text-3xl mb-2">Couldn't load proposal</h1>
        <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const issued = data.sent_at ? new Date(data.sent_at) : null;
  const balance =
    data.deposit_cents != null
      ? data.subtotal_cents - data.deposit_cents
      : data.subtotal_cents;

  return (
    <div className="min-h-screen bg-white text-black p-8 print:p-0">
      <div className="max-w-2xl mx-auto">
        {/* Print toolbar — hidden from the printed copy */}
        <div className="print-hide flex items-center justify-end mb-6 gap-2">
          <Button
            type="button"
            onClick={() => window.print()}
            className="rounded-full"
            size="sm"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print / Save PDF
          </Button>
        </div>

        <header className="mb-8 pb-6 border-b border-black/15">
          <p className="text-xs uppercase tracking-[0.3em] mb-3">Proposal</p>
          <h1 className="text-3xl font-serif mb-1">{data.title}</h1>
          {data.vendor && (
            <p className="text-sm">
              <span className="font-medium">{data.vendor.business_name}</span>
              {data.vendor.location && (
                <> · {data.vendor.location}</>
              )}
            </p>
          )}
          <div className="text-xs text-black/60 mt-3 flex flex-wrap gap-x-6 gap-y-1">
            {issued && <span>Issued {issued.toLocaleDateString()}</span>}
            {data.inquiry?.event_type && (
              <span className="capitalize">
                Event: {data.inquiry.event_type.replace(/_/g, " ")}
              </span>
            )}
            {data.inquiry?.event_date && (
              <span>Event date: {data.inquiry.event_date}</span>
            )}
            <span>Status: {data.status}</span>
          </div>
        </header>

        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-[0.2em] mb-3 text-black/60">
            Line items
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/15">
                <th className="text-left py-2 font-medium">Description</th>
                <th className="text-right py-2 font-medium w-16">Qty</th>
                <th className="text-right py-2 font-medium w-24">Unit</th>
                <th className="text-right py-2 font-medium w-24">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.line_items.map((it, i) => (
                <tr key={i} className="border-b border-black/10">
                  <td className="py-2.5">{it.description}</td>
                  <td className="text-right py-2.5 tabular-nums">
                    {it.quantity}
                  </td>
                  <td className="text-right py-2.5 tabular-nums">
                    {formatCents(it.unit_price_cents)}
                  </td>
                  <td className="text-right py-2.5 tabular-nums">
                    {formatCents(it.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="text-right py-3 text-sm font-medium">
                  Subtotal
                </td>
                <td className="text-right py-3 tabular-nums font-medium">
                  {formatCents(data.subtotal_cents)}
                </td>
              </tr>
              {data.deposit_cents != null && (
                <>
                  <tr>
                    <td colSpan={3} className="text-right py-1 text-sm">
                      Deposit due now
                    </td>
                    <td className="text-right py-1 tabular-nums">
                      {formatCents(data.deposit_cents)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={3}
                      className="text-right py-1 text-sm border-t border-black/15"
                    >
                      Balance
                    </td>
                    <td className="text-right py-1 tabular-nums border-t border-black/15">
                      {formatCents(balance)}
                    </td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </section>

        {data.terms && (
          <section className="mb-8">
            <h2 className="text-xs uppercase tracking-[0.2em] mb-3 text-black/60">
              Terms
            </h2>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {data.terms}
            </p>
          </section>
        )}

        {data.contract_body && (
          <section className="mb-8">
            <h2 className="text-xs uppercase tracking-[0.2em] mb-3 text-black/60">
              Contract
            </h2>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {data.contract_body}
            </p>
          </section>
        )}

        <footer className="mt-12 pt-6 border-t border-black/15 text-xs text-black/50">
          Powered by Vendora · vendora.events
        </footer>
      </div>
    </div>
  );
}
