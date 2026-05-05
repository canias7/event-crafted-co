import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, AlertCircle, FileText, ArrowRight, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/public/Footer";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { formatCents } from "@/lib/format";

// Read-only public proposal view via share token. Vendor turns
// sharing on with the toggle on their proposal; recipient opens
// /p/:token without an account. Accept/decline isn't here — that
// still requires a host login because RLS gates writes.

interface LineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
}

interface PublicProposal {
  id: string;
  title: string;
  line_items: LineItem[];
  subtotal_cents: number;
  deposit_cents: number | null;
  terms: string | null;
  contract_body: string | null;
  status: string;
  sent_at: string | null;
  vendor: {
    business_name: string;
    location: string | null;
    slug: string | null;
  };
  event: {
    event_type: string | null;
    event_date: string | null;
  };
}

export default function PublicProposalPage() {
  const { token } = useParams();
  const [data, setData] = useState<PublicProposal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row } = await (supabase as any).rpc(
        "get_proposal_by_share_token",
        { p_token: token },
      );
      if (cancelled) return;
      setData((row as PublicProposal | null) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useDocumentMeta({
    title: data ? `${data.title} — ${data.vendor.business_name}` : "Proposal",
    description: data
      ? `${data.vendor.business_name}'s proposal: ${data.title}`
      : "Vendor proposal",
    type: "website",
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
        <h1 className="font-display text-2xl mb-2">Proposal not found</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          The vendor may have turned off sharing on this proposal.
          Reach out to them for an updated link.
        </p>
        <Button asChild className="mt-6 rounded-full" variant="outline">
          <Link to="/">Back to Vendora</Link>
        </Button>
      </div>
    );
  }

  const balance =
    data.deposit_cents != null
      ? data.subtotal_cents - data.deposit_cents
      : data.subtotal_cents;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 px-4 md:px-8 py-12">
        <div className="max-w-2xl mx-auto">
          <header className="mb-8">
            <p className="font-label text-accent mb-3 inline-flex items-center gap-1.5">
              <FileText className="w-3 h-3" />
              Proposal · read-only
            </p>
            <h1 className="font-display text-3xl mb-2 leading-tight">
              {data.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              From{" "}
              {data.vendor.slug ? (
                <Link
                  to={`/v/${data.vendor.slug}`}
                  className="text-accent hover:underline"
                >
                  {data.vendor.business_name}
                </Link>
              ) : (
                <span className="font-medium">{data.vendor.business_name}</span>
              )}
              {data.vendor.location && <> · {data.vendor.location}</>}
            </p>
          </header>

          <section className="rounded-sm border border-border bg-card p-5 mb-6">
            <h2 className="text-xs uppercase tracking-[0.2em] mb-3 text-muted-foreground">
              Line items
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {data.line_items.map((it, i) => (
                  <tr
                    key={i}
                    className="border-b border-border/50 last:border-b-0"
                  >
                    <td className="py-2.5 pr-3">
                      <p>{it.description}</p>
                      {it.quantity > 1 && (
                        <p className="text-xs text-muted-foreground tnum">
                          {it.quantity} × {formatCents(it.unit_price_cents)}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatCents(it.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="text-right py-3 text-sm font-medium">
                    Subtotal
                  </td>
                  <td className="text-right py-3 tabular-nums font-medium">
                    {formatCents(data.subtotal_cents)}
                  </td>
                </tr>
                {data.deposit_cents != null && (
                  <>
                    <tr>
                      <td className="text-right py-1 text-sm text-muted-foreground">
                        Deposit
                      </td>
                      <td className="text-right py-1 tabular-nums text-muted-foreground">
                        {formatCents(data.deposit_cents)}
                      </td>
                    </tr>
                    <tr>
                      <td className="text-right py-1 text-sm text-muted-foreground border-t border-border">
                        Balance
                      </td>
                      <td className="text-right py-1 tabular-nums text-muted-foreground border-t border-border">
                        {formatCents(balance)}
                      </td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          </section>

          {data.terms && (
            <section className="rounded-sm border border-border bg-card p-5 mb-6">
              <h2 className="text-xs uppercase tracking-[0.2em] mb-3 text-muted-foreground">
                Terms
              </h2>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {data.terms}
              </p>
            </section>
          )}

          {data.contract_body && (
            <section className="rounded-sm border border-border bg-card p-5 mb-6">
              <h2 className="text-xs uppercase tracking-[0.2em] mb-3 text-muted-foreground">
                Contract
              </h2>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {data.contract_body}
              </p>
            </section>
          )}

          <div className="rounded-sm border border-border bg-secondary/30 p-5 text-sm leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground mb-1">
              Want to accept this proposal?
            </p>
            <p>
              Sign in to your Vendora account from{" "}
              <Link to="/" className="text-accent hover:underline">
                vendora.events
              </Link>{" "}
              and you'll see Accept / Decline buttons on the proposal in
              your inquiry.
            </p>
            <div className="mt-4 flex gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => window.print()}
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Print / Save PDF
              </Button>
              <Button
                asChild
                size="sm"
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                <Link to="/customer/inquiries">
                  Open in Vendora
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
