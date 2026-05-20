import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Crown, Loader2, Sparkles, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { vendorNavItems as navItems } from "@/data/navItems";

// Subscription / plan surface. Vendora has 2 vendor plans today:
//   1. Free — every account by default. 1 listing.
//   2. Pro — $19.99/mo. 5 listings, featured placement, priority
//      support. Wired to Stripe Checkout in subscription mode; the
//      portal handles cancel / card update / invoice history.
//
// Status is webhook-driven (stripe-webhook → vendor_profiles). We
// read live state here on each mount + after the Stripe redirects.

const FREE_INCLUDED = [
  "1 listing per account",
  "Unlimited inquiries from hosts",
  "Calendar + availability blocking",
  "Vendor-to-vendor DMs",
  "Public listing on the Vendora directory",
];

const PRO_INCLUDED = [
  "Up to 5 listings per account",
  "Everything in Free",
  "Featured placement in search (coming soon)",
  "Priority support",
];

const PRO_PRICE = 19.99;

interface PlanState {
  tier: "free" | "pro";
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "unpaid"
    | "paused"
    | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
}

export default function VendorSubscriptionPage() {
  const { ownListing } = useAuth();
  const [search, setSearch] = useSearchParams();
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<"upgrade" | "portal" | null>(null);

  const vendorId = ownListing?.id ?? null;

  const load = useCallback(async () => {
    if (!vendorId) {
      setPlan(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("vendor_profiles")
      .select(
        "subscription_tier, subscription_status, subscription_cancel_at_period_end, subscription_current_period_end, stripe_customer_id",
      )
      .eq("id", vendorId)
      .maybeSingle();
    setPlan(
      data
        ? {
            tier: (data.subscription_tier as "free" | "pro") ?? "free",
            status: (data.subscription_status as PlanState["status"]) ?? null,
            cancelAtPeriodEnd: !!data.subscription_cancel_at_period_end,
            currentPeriodEnd: data.subscription_current_period_end ?? null,
            stripeCustomerId: data.stripe_customer_id ?? null,
          }
        : { tier: "free", status: null, cancelAtPeriodEnd: false, currentPeriodEnd: null, stripeCustomerId: null },
    );
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch on Stripe redirects (?upgraded=1 success, ?cancelled=1
  // cancel). Strip the query param so a refresh doesn't keep firing.
  useEffect(() => {
    const upgraded = search.get("upgraded");
    const cancelled = search.get("cancelled");
    if (upgraded || cancelled) {
      if (upgraded) {
        toast.success("Thanks for upgrading — Pro is active.");
      }
      load();
      const next = new URLSearchParams(search);
      next.delete("upgraded");
      next.delete("cancelled");
      setSearch(next, { replace: true });
    }
  }, [search, setSearch, load]);

  async function upgrade() {
    if (!vendorId || acting) return;
    setActing("upgrade");
    const { data, error } = await supabase.functions.invoke(
      "stripe-subscription-checkout",
      { body: { vendor_id: vendorId } },
    );
    setActing(null);
    if (error) {
      toast.error(error.message ?? "Couldn't start checkout");
      return;
    }
    const url = (data as { url?: string } | null)?.url;
    if (!url) {
      toast.error("Stripe didn't return a checkout URL");
      return;
    }
    window.location.href = url;
  }

  async function openPortal() {
    if (!vendorId || acting) return;
    setActing("portal");
    const { data, error } = await supabase.functions.invoke(
      "stripe-customer-portal",
      { body: { vendor_id: vendorId } },
    );
    setActing(null);
    if (error) {
      toast.error(error.message ?? "Couldn't open portal");
      return;
    }
    const url = (data as { url?: string } | null)?.url;
    if (!url) return;
    window.location.href = url;
  }

  const isPro = plan?.tier === "pro";
  const renewsAt = plan?.currentPeriodEnd
    ? new Date(plan.currentPeriodEnd).toLocaleDateString(undefined, {
        dateStyle: "long",
      })
    : null;

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40">
          <h1 className="font-editorial text-3xl">Subscription</h1>
          <p className="text-sm text-muted-foreground">
            Your Vendora plan and billing
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-3xl space-y-4">
          {/* Current plan card */}
          <div
            className="rounded-2xl p-6"
            style={{
              background: "rgba(255,253,250,0.7)",
              border: "0.5px solid rgba(255,138,76,0.22)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-label text-muted-foreground">
                  Current plan
                </p>
                <h2 className="font-editorial text-3xl mt-1">
                  {loading ? "—" : isPro ? "Vendora Pro" : "Free"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {isPro
                    ? plan?.cancelAtPeriodEnd
                      ? `Cancels ${renewsAt ?? "at end of period"} — you'll be moved to Free.`
                      : renewsAt
                        ? `Renews ${renewsAt}.`
                        : "Active."
                    : "All the essentials to land bookings on Vendora."}
                </p>
              </div>
              {!loading && (
                <PlanBadge tier={isPro ? "pro" : "free"} status={plan?.status ?? null} />
              )}
            </div>

            {plan?.status === "past_due" && (
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <p className="font-medium text-foreground">Payment failed</p>
                  <p className="text-muted-foreground">
                    Your card was declined. Update it from the billing
                    portal — Stripe is retrying for a few days before
                    Pro is paused.
                  </p>
                </div>
              </div>
            )}

            <ul className="mt-5 space-y-2">
              {(isPro ? PRO_INCLUDED : FREE_INCLUDED).map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-2 text-sm text-foreground/85"
                >
                  <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            {isPro && (
              <div className="mt-5">
                <Button
                  onClick={openPortal}
                  disabled={acting !== null}
                  variant="outline"
                  className="rounded-full"
                >
                  {acting === "portal" ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Manage billing
                </Button>
              </div>
            )}
          </div>

          {/* Pro tier card — hidden when already Pro */}
          {!loading && !isPro && (
            <div
              className="rounded-2xl p-6"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,138,76,0.10), rgba(255,138,76,0.04))",
                border: "0.5px solid rgba(255,138,76,0.30)",
              }}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <span
                    className="shrink-0 w-10 h-10 rounded-xl inline-flex items-center justify-center"
                    style={{
                      background: "rgba(255,138,76,0.18)",
                      color: "#c4541e",
                    }}
                    aria-hidden
                  >
                    <Crown className="w-4 h-4" />
                  </span>
                  <div>
                    <p className="font-label text-muted-foreground">Upgrade</p>
                    <h2 className="font-editorial text-2xl mt-0.5">
                      Vendora Pro
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      <span className="font-semibold text-foreground tnum">
                        ${PRO_PRICE.toFixed(2)}
                      </span>{" "}
                      / month
                    </p>
                  </div>
                </div>
                <Button
                  onClick={upgrade}
                  disabled={acting !== null}
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  {acting === "upgrade" ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Crown className="w-4 h-4 mr-1.5" />
                  )}
                  Upgrade to Pro
                </Button>
              </div>

              <ul className="mt-5 space-y-2">
                {PRO_INCLUDED.map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2 text-sm text-foreground/80"
                  >
                    <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI Superagents teaser — three more plans land here. */}
          <div
            className="rounded-2xl p-5 flex items-start gap-3"
            style={{
              background: "rgba(255,253,250,0.7)",
              border: "0.5px dashed rgba(255,138,76,0.30)",
            }}
          >
            <span
              className="shrink-0 w-9 h-9 rounded-xl inline-flex items-center justify-center"
              style={{
                background: "rgba(255,138,76,0.14)",
                color: "#c4541e",
              }}
              aria-hidden
            >
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium">AI Superagents — 3 plans, coming soon</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Auto-reply drafts on every inquiry, smart follow-ups, and
                proposal generation. Sold separately from Pro.
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground px-2">
            Billing is handled via Stripe. You'll get a receipt by email
            for each charge.
          </p>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}

function PlanBadge({
  tier,
  status,
}: {
  tier: "free" | "pro";
  status: PlanState["status"];
}) {
  // Stripe statuses we surface as a chip. "active"/"trialing" map to
  // the orange success chip; anything else (past_due, canceled,
  // unpaid, paused, incomplete*) renders as the neutral chip with
  // the literal status text so the vendor sees what Stripe sees.
  const isHealthy =
    tier === "pro" && (status === "active" || status === "trialing");
  if (isHealthy) {
    return (
      <span
        className="inline-flex items-center text-[11px] font-medium rounded-full px-2.5 py-1"
        style={{ background: "rgba(255,138,76,0.14)", color: "#c4541e" }}
      >
        Active
      </span>
    );
  }
  if (tier === "free") {
    return (
      <span className="inline-flex items-center text-[11px] font-medium rounded-full px-2.5 py-1 bg-muted text-muted-foreground">
        Free
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[11px] font-medium rounded-full px-2.5 py-1 bg-amber-500/15 text-amber-700">
      {status ?? "Inactive"}
    </span>
  );
}
