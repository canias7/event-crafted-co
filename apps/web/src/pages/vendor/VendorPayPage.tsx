import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Loader2, CheckCircle2, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

// Vendor payouts setup. Stripe Connect Express — the vendor links
// (or creates) a Stripe account hosted on Stripe's side, completes
// KYC + bank details there, and on return we read back the
// capability flags via webhook.

interface StripeState {
  vendor_id: string;
  business_name: string;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_details_submitted: boolean;
  stripe_onboarding_completed_at: string | null;
}

export default function VendorPayPage() {
  const { user, ownListing } = useAuth();
  const [search, setSearch] = useSearchParams();
  const [state, setState] = useState<StripeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const vendorId = ownListing?.id ?? null;

  const load = useCallback(async () => {
    if (!vendorId) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_profiles")
      .select(
        "id, business_name, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_onboarding_completed_at",
      )
      .eq("id", vendorId)
      .maybeSingle();
    setState(
      data
        ? {
            vendor_id: data.id,
            business_name: data.business_name,
            stripe_account_id: data.stripe_account_id ?? null,
            stripe_charges_enabled: !!data.stripe_charges_enabled,
            stripe_payouts_enabled: !!data.stripe_payouts_enabled,
            stripe_details_submitted: !!data.stripe_details_submitted,
            stripe_onboarding_completed_at:
              data.stripe_onboarding_completed_at ?? null,
          }
        : null,
    );
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  // When the user returns from Stripe-hosted onboarding the URL
  // carries ?stripe=return. Refetch immediately so the page reflects
  // the new state (webhook may have already updated us, or may land
  // a few seconds later). Strip the query param so a refresh doesn't
  // re-trigger.
  useEffect(() => {
    const flag = search.get("stripe");
    if (flag === "return" || flag === "refresh") {
      load();
      const next = new URLSearchParams(search);
      next.delete("stripe");
      setSearch(next, { replace: true });
    }
  }, [search, setSearch, load]);

  async function startOnboarding() {
    if (!vendorId || acting) return;
    setActing(true);
    const { data, error } = await supabase.functions.invoke(
      "stripe-connect-onboard",
      { body: { vendor_id: vendorId } },
    );
    setActing(false);
    if (error) {
      toast.error(error.message ?? "Couldn't start Stripe onboarding");
      return;
    }
    const url = (data as { url?: string } | null)?.url;
    if (!url) {
      toast.error("Stripe didn't return an onboarding URL");
      return;
    }
    window.location.href = url;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vendorId) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="font-editorial text-3xl mb-3">Vendora Pay</h1>
        <p className="text-sm text-muted-foreground">
          You need an approved vendor listing before connecting payouts.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center gap-3 mb-2">
        <CreditCard className="w-5 h-5 text-accent" />
        <p className="font-label text-accent">Payouts</p>
      </div>
      <h1 className="font-editorial text-4xl mb-3">Vendora Pay</h1>
      <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed">
        Take deposits and final payments through Vendora. Hosts pay
        with card; funds settle into your Stripe account net of the
        platform fee.
      </p>

      {loading ? (
        <div className="rounded-sm border border-border bg-card p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <StripeStatusCard
          state={state}
          acting={acting}
          onStart={startOnboarding}
        />
      )}
    </main>
  );
}

function StripeStatusCard({
  state,
  acting,
  onStart,
}: {
  state: StripeState | null;
  acting: boolean;
  onStart: () => void;
}) {
  if (!state) {
    return (
      <div className="rounded-sm border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Couldn't load your vendor profile.</p>
      </div>
    );
  }

  const status: "not_started" | "incomplete" | "active" =
    !state.stripe_account_id
      ? "not_started"
      : state.stripe_charges_enabled && state.stripe_payouts_enabled
        ? "active"
        : "incomplete";

  if (status === "active") {
    return (
      <div className="rounded-sm border border-border bg-card p-6">
        <div className="flex items-start gap-3 mb-4">
          <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Connected to Stripe</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hosts can pay deposits and balances. Payouts route to your bank.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-sm border border-border p-3">
            <p className="text-muted-foreground">Charges</p>
            <p className="font-medium mt-1">
              {state.stripe_charges_enabled ? "Enabled" : "Disabled"}
            </p>
          </div>
          <div className="rounded-sm border border-border p-3">
            <p className="text-muted-foreground">Payouts</p>
            <p className="font-medium mt-1">
              {state.stripe_payouts_enabled ? "Enabled" : "Disabled"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={onStart}
          disabled={acting}
          className="rounded-full mt-5"
        >
          {acting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
          Update Stripe details
        </Button>
      </div>
    );
  }

  if (status === "incomplete") {
    return (
      <div className="rounded-sm border border-amber-500/30 bg-amber-500/5 p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Onboarding not finished</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Stripe still needs information to enable payouts. This
              normally takes a couple of minutes — bank details + ID.
            </p>
          </div>
        </div>
        <Button
          onClick={onStart}
          disabled={acting}
          className="rounded-full bg-foreground text-background hover:bg-foreground/90"
        >
          {acting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Continue onboarding
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-card p-6">
      <p className="font-medium mb-1">Connect your Stripe account</p>
      <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
        We'll send you to Stripe's secure onboarding flow. You'll
        confirm your identity and link a bank account for payouts.
        Takes a few minutes.
      </p>
      <Button
        onClick={onStart}
        disabled={acting}
        className="rounded-full bg-foreground text-background hover:bg-foreground/90"
      >
        {acting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
        Connect Stripe
      </Button>
    </div>
  );
}
