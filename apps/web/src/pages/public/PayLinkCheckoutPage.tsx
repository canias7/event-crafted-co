// VendoraPay public pay-link checkout. Hosts land here from a link
// the vendor shared (/pay/link/<slug>). No auth required.
//
// Renders the vendor's brand + amount + description, then a single
// Pay button that calls vendorapay-link-checkout (no JWT) to mint a
// Stripe Checkout Session and redirect to it. After payment, Stripe
// brings them back here with ?status=success.
//
// States: loading / not-found / expired / cancelled / paid / active.

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface LinkDetails {
  id: string;
  vendor_id: string;
  title: string;
  description: string | null;
  amount_cents: number;
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

export default function PayLinkCheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const flow = searchParams.get("status");

  const [link, setLink] = useState<LinkDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!slug) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "get_payment_link_for_checkout",
        { p_slug: slug },
      );
      if (cancelled) return;
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setLink(row as LinkDetails);
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
    const { data, error } = await supabase.functions.invoke("vendorapay-link-checkout", {
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

  if (notFound || !link) {
    return (
      <Shell>
        <Centered title="Link not found" sub="This pay link doesn't exist or has been cancelled by the vendor." />
      </Shell>
    );
  }

  if (flow === "success") {
    return (
      <Shell>
        <Centered
          icon={<Check className="w-7 h-7 text-emerald-600" />}
          title="Payment received"
          sub={`Thanks. ${link.vendor_business_name ?? "Your vendor"} will be in touch.`}
        />
      </Shell>
    );
  }

  const expired = link.status !== "active";

  return (
    <Shell>
      <div className="max-w-md mx-auto px-4 py-12">
        {/* Vendor brand */}
        <div className="flex items-center gap-3 mb-8">
          {link.vendor_logo_url ? (
            <img
              src={link.vendor_logo_url}
              alt={link.vendor_business_name ?? ""}
              className="w-12 h-12 rounded-full object-cover ring-1 ring-foreground/10"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-foreground/5 inline-flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              {link.vendor_business_name ?? "VendoraPay"}
            </div>
            <div className="text-[11px] text-muted-foreground">Powered by VendoraPay</div>
          </div>
        </div>

        {/* Amount + title */}
        <div
          className="rounded-2xl p-6 mb-4"
          style={{
            background: "rgba(255,253,250,0.7)",
            border: "0.5px solid rgba(255,138,76,0.22)",
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Amount due
          </div>
          <div className="text-4xl font-editorial mt-1">
            {formatMoney(link.amount_cents, link.currency)}
          </div>
          <div className="text-sm mt-3">{link.title}</div>
          {link.description ? (
            <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
              {link.description}
            </p>
          ) : null}
        </div>

        {/* Pay button */}
        {expired ? (
          <div className="text-center text-sm text-muted-foreground">
            This link is no longer accepting payments.
          </div>
        ) : (
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
            Pay {formatMoney(link.amount_cents, link.currency)}
          </Button>
        )}

        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Card payments processed securely. You'll see "VENDORAPAY" on your statement.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen vendor-canvas">
      {children}
    </div>
  );
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
