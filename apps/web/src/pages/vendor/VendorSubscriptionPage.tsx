import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Crown, Loader2, Sparkles, Flame } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVendorCredits } from "@/hooks/useVendorCredits";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import { vendorNavItems as navItems } from "@/data/navItems";

// Subscription + AI credits surface for the vendor.
//
// Vendora's plan model (post credits launch):
//   Free        — 1 listing, no included AI credits (100 trial on signup).
//   Starter $14.99 / mo  — 1 listing,  200 AI credits/mo.
//   Pro     $39    / mo  — 5 listings, 800 AI credits/mo, featured search.
//   Studio  $99    / mo  — unlimited listings, 2,500 AI credits/mo, team seats.
//
// AI credits buy HILUX replies (2 cr), Axion images (10 cr), Mux
// minutes (1 cr/min). 1 credit ≈ $0.025 retail. Top-up packs
// available to anyone — vendors don't need a subscription to buy
// credits.
//
// Tier change goes through Stripe Checkout; the existing customer
// portal handles cancel / card update / invoice history.

// Launch offer end. Past this date the anchor prices + the
// countdown banner disappear. Edit (or remove) to extend / kill
// the promo. Stored client-side because it's marketing UX — the
// actual Stripe prices are unchanged either way.
const LAUNCH_OFFER_ENDS_AT = "2026-06-30T23:59:59-04:00";

// Keep these tables in sync with vendor_credit_packages on the DB.
// Price IDs below are TEST-MODE (created 2026-05-23 in Stripe sandbox).
// Swap to live-mode IDs (price_1TaBv...) when going live + updating
// STRIPE_SECRET_KEY env var accordingly.
//
// wasMonthly is the anchor price we render as a strikethrough above
// the current price — frames launch pricing as a discount. Pure
// marketing copy, not stored anywhere in Stripe.
const TIERS: Array<{
  id: "free" | "starter" | "pro" | "studio";
  name: string;
  priceMonthly: number;
  wasMonthly?: number;
  priceId: string | null; // null = Free (no checkout)
  monthlyCredits: number;
  listings: string;
  highlights: string[];
}> = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceId: null,
    monthlyCredits: 0,
    listings: "1 listing",
    highlights: [
      "Inquiry inbox + DMs",
      "Calendar + availability",
      "100 gallery images",
      "100 trial credits on signup",
      "Top up credits anytime",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 14.99,
    wasMonthly: 29,
    priceId: "price_1TaKot2VPrcT6XA1pMa6Q1fY",
    monthlyCredits: 200,
    listings: "1 listing",
    highlights: [
      "200 AI credits / month",
      "500 gallery images",
      "Lead scoring on every inquiry",
      "Proposals + appointments",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 39,
    wasMonthly: 89,
    priceId: "price_1TaKpC2VPrcT6XA17I2TSi6u",
    monthlyCredits: 800,
    listings: "Up to 5 listings",
    highlights: [
      "800 AI credits / month",
      "1,200 gallery images",
      "Featured search placement",
      "MCP Claude.ai connector",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    priceMonthly: 99,
    wasMonthly: 249,
    priceId: "price_1TaKpY2VPrcT6XA1EfBgJryx",
    monthlyCredits: 2500,
    listings: "Unlimited listings",
    highlights: [
      "2,500 AI credits / month",
      "2,000 gallery images",
      "Unlimited team seats",
      "Priority support + MCP",
    ],
  },
];

const TOPUPS: Array<{
  id: string;
  name: string;
  credits: number;
  price: number;
  priceId: string;
  blurb: string;
}> = [
  {
    id: "boost",
    name: "Boost",
    credits: 500,
    price: 12,
    priceId: "price_1TaKq72VPrcT6XA1AeyBHdnn",
    blurb: "~250 HILUX replies or 50 Axion images",
  },
  {
    id: "power",
    name: "Power",
    credits: 1500,
    price: 30,
    priceId: "price_1TaKqc2VPrcT6XA1kr2icZHw",
    blurb: "~750 HILUX replies or 150 Axion images",
  },
  {
    id: "pro_pack",
    name: "Pro Pack",
    credits: 3500,
    price: 60,
    priceId: "price_1TaKr12VPrcT6XA1YjzZcylM",
    blurb: "~1,750 HILUX replies or 350 Axion images",
  },
  {
    id: "studio_pack",
    name: "Studio Pack",
    credits: 8000,
    price: 120,
    priceId: "price_1TaKrZ2VPrcT6XA1SmiwGeis",
    blurb: "~4,000 HILUX replies or 800 Axion images — best $/credit",
  },
];

interface PlanState {
  tier: "free" | "starter" | "pro" | "studio";
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
  const { ownListing, user } = useAuth();
  const [search, setSearch] = useSearchParams();
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const vendorId = ownListing?.id ?? null;
  const credits = useVendorCredits(user?.id ?? null);

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
            tier: (data.subscription_tier as PlanState["tier"]) ?? "free",
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
    void load();
  }, [load]);

  // Refetch on Stripe redirects (?upgraded=1, ?topup=1, etc.).
  useEffect(() => {
    const upgraded = search.get("upgraded");
    const cancelled = search.get("cancelled");
    const topup = search.get("topup");
    const topupCancelled = search.get("topup_cancelled");
    if (upgraded || cancelled || topup || topupCancelled) {
      if (upgraded) toast.success("Thanks for upgrading — plan is active.");
      if (topup) toast.success("Credits added to your balance.");
      void load();
      void credits.refresh();
      const next = new URLSearchParams(search);
      ["upgraded", "cancelled", "topup", "topup_cancelled"].forEach((k) => next.delete(k));
      setSearch(next, { replace: true });
    }
  }, [search, setSearch, load, credits]);

  async function callStripeFunction(
    functionName: string,
    body: Record<string, unknown>,
    fallbackError: string,
  ): Promise<string | null> {
    const popup = window.open("about:blank", "_blank");
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
    });
    if (error) {
      let msg = error.message ?? fallbackError;
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.text === "function") {
        try {
          const text = await ctx.text();
          const parsed = JSON.parse(text);
          if (parsed?.error) msg = String(parsed.error);
        } catch {
          // body wasn't json
        }
      }
      if (popup && !popup.closed) popup.close();
      toast.error(msg);
      return null;
    }
    const url = (data as { url?: string } | null)?.url;
    if (!url) {
      if (popup && !popup.closed) popup.close();
      toast.error("Stripe didn't return a URL");
      return null;
    }
    if (popup && !popup.closed) {
      popup.location.href = url;
      return url;
    }
    window.location.href = url;
    return url;
  }

  async function upgradeTo(tier: typeof TIERS[number]) {
    if (!vendorId || actingId || !tier.priceId) return;
    setActingId(`tier_${tier.id}`);
    await callStripeFunction(
      "stripe-subscription-checkout",
      { vendor_id: vendorId, price_id: tier.priceId },
      "Couldn't start checkout",
    );
    setActingId(null);
  }

  async function buyTopup(pack: typeof TOPUPS[number]) {
    if (!vendorId || actingId) return;
    setActingId(`topup_${pack.id}`);
    await callStripeFunction(
      "stripe-topup-checkout",
      { vendor_id: vendorId, price_id: pack.priceId },
      "Couldn't start top-up checkout",
    );
    setActingId(null);
  }

  // Live countdown to launch offer expiry. Re-renders every second
  // while the offer is still active; flips off when expired so the
  // wasMonthly anchors disappear automatically.
  const launchEndsMs = useMemo(
    () => new Date(LAUNCH_OFFER_ENDS_AT).getTime(),
    [],
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (Date.now() >= launchEndsMs) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [launchEndsMs]);
  const offerActive = nowMs < launchEndsMs;
  const countdown = useMemo(() => {
    if (!offerActive) return null;
    const diff = launchEndsMs - nowMs;
    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor((diff % 86_400_000) / 3_600_000);
    const minutes = Math.floor((diff % 3_600_000) / 60_000);
    const seconds = Math.floor((diff % 60_000) / 1000);
    return { days, hours, minutes, seconds };
  }, [offerActive, launchEndsMs, nowMs]);

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40">
          <h1 className="font-editorial text-3xl">Subscription</h1>
          <p className="text-sm text-muted-foreground">
            Pick a plan or top up credits. Track usage on the Usage tab.
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-5xl space-y-5">
          {/* Current-plan and AI-credits cards moved to /vendor/usage.
              This page is plan-selection-only now. */}

          {/* ===== Launch offer countdown banner ===== */}
          {offerActive && countdown && (
            <div
              className="rounded-2xl p-4 flex items-center gap-3 flex-wrap"
              style={{
                background: "linear-gradient(135deg, rgba(255,138,76,0.18), rgba(255,138,76,0.06))",
                border: "1px solid rgba(255,138,76,0.45)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                boxShadow: "0 8px 28px -12px rgba(255,138,76,0.20)",
              }}
            >
              <span
                className="shrink-0 w-9 h-9 rounded-xl inline-flex items-center justify-center"
                style={{ background: "rgba(255,138,76,0.22)", color: "#c4541e" }}
                aria-hidden
              >
                <Flame className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">
                  Launch pricing — up to 60% off
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lock in these rates before the offer ends. New rates apply on the next billing cycle after expiry.
                </p>
              </div>
              <div
                className="flex items-center gap-2 tnum"
                aria-label="Time remaining"
              >
                <CountdownCell n={countdown.days} label="d" />
                <span className="text-foreground/40">:</span>
                <CountdownCell n={countdown.hours} label="h" pad />
                <span className="text-foreground/40">:</span>
                <CountdownCell n={countdown.minutes} label="m" pad />
                <span className="text-foreground/40">:</span>
                <CountdownCell n={countdown.seconds} label="s" pad />
              </div>
            </div>
          )}

          {/* ===== Tier grid ===== */}
          <div>
            <h3 className="font-editorial text-2xl mb-3">Choose a plan</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {TIERS.map((tier) => {
                const isCurrent = plan?.tier === tier.id;
                const isAct = actingId === `tier_${tier.id}`;
                return (
                  <div
                    key={tier.id}
                    className="rounded-2xl p-5 flex flex-col"
                    style={{
                      background: isCurrent
                        ? "linear-gradient(135deg, rgba(255,138,76,0.12), rgba(255,138,76,0.04))"
                        : "rgba(255,253,250,0.7)",
                      border: isCurrent
                        ? "1px solid rgba(255,138,76,0.45)"
                        : "0.5px solid rgba(255,138,76,0.22)",
                      backdropFilter: "blur(10px)",
                      WebkitBackdropFilter: "blur(10px)",
                      boxShadow: isCurrent
                        ? "0 8px 28px -12px rgba(255,138,76,0.25)"
                        : "0 4px 18px -8px rgba(20,15,10,0.06)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-foreground">{tier.name}</p>
                        {tier.wasMonthly && offerActive && !isCurrent && (
                          <span
                            className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(255,138,76,0.18)", color: "#c4541e" }}
                          >
                            Save {Math.round((1 - tier.priceMonthly / tier.wasMonthly) * 100)}%
                          </span>
                        )}
                      </div>
                      {isCurrent && (
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-[#c4541e]">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-1">
                      {tier.wasMonthly && offerActive && (
                        <span className="text-sm text-muted-foreground line-through mr-1.5 tnum">
                          ${tier.wasMonthly}
                        </span>
                      )}
                      <span className="text-2xl font-semibold tnum">
                        ${tier.priceMonthly.toFixed(2)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">/ mo</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {tier.monthlyCredits > 0
                        ? `${tier.monthlyCredits.toLocaleString()} credits/mo · ${tier.listings}`
                        : tier.listings}
                    </p>
                    {tier.wasMonthly && offerActive && !isCurrent && (
                      <p className="text-[10px] text-[#c4541e] font-medium mt-0.5">
                        Launch pricing — limited time
                      </p>
                    )}

                    <ul className="mt-3 space-y-1.5 flex-1">
                      {tier.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-1.5 text-xs text-foreground/85">
                          <Check className="w-3 h-3 text-accent shrink-0 mt-[3px]" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4">
                      {tier.priceId ? (
                        <Button
                          onClick={() => upgradeTo(tier)}
                          disabled={actingId !== null || isCurrent}
                          size="sm"
                          className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                        >
                          {isAct ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Crown className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          {isCurrent ? "Current plan" : `Choose ${tier.name}`}
                        </Button>
                      ) : (
                        <Button
                          disabled
                          size="sm"
                          variant="outline"
                          className="w-full rounded-full"
                        >
                          {isCurrent ? "Current plan" : "Free — default"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 px-1">
              To switch between paid tiers, open the billing portal — that keeps
              your card on file and prorates the change. New paid subscribers
              checkout fresh here.
            </p>
          </div>

          {/* ===== Top-up grid ===== */}
          <div>
            <h3 className="font-editorial text-2xl mb-1">Top up credits</h3>
            <p className="text-sm text-muted-foreground mb-3">
              One-time purchase. Credits never expire. Bigger packs = better
              $/credit.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {TOPUPS.map((pack) => {
                const isAct = actingId === `topup_${pack.id}`;
                const perCredit = (pack.price / pack.credits) * 100;
                return (
                  <div
                    key={pack.id}
                    className="rounded-2xl p-5 flex flex-col"
                    style={{
                      background: "rgba(255,253,250,0.7)",
                      border: "0.5px solid rgba(255,138,76,0.22)",
                      backdropFilter: "blur(10px)",
                      WebkitBackdropFilter: "blur(10px)",
                      boxShadow: "0 4px 18px -8px rgba(20,15,10,0.06)",
                    }}
                  >
                    <p className="font-medium">{pack.name}</p>
                    <p className="mt-1">
                      <span className="text-2xl font-semibold tnum">
                        {pack.credits.toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">credits</span>
                    </p>
                    <p className="text-sm text-foreground mt-0.5 tnum">
                      ${pack.price}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {perCredit.toFixed(2)}¢ / credit
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 flex-1">
                      {pack.blurb}
                    </p>
                    <Button
                      onClick={() => buyTopup(pack)}
                      disabled={actingId !== null}
                      size="sm"
                      variant="outline"
                      className="w-full rounded-full mt-3"
                    >
                      {isAct ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Buy {pack.name}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-muted-foreground px-2">
            Billing is handled via Stripe. You'll get a receipt by email for
            each charge.
          </p>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}

function CountdownCell({
  n,
  label,
  pad,
}: {
  n: number;
  label: string;
  pad?: boolean;
}) {
  const text = pad ? String(n).padStart(2, "0") : String(n);
  return (
    <div className="flex items-baseline gap-0.5">
      <span className="text-lg md:text-xl font-semibold tabular-nums text-foreground">
        {text}
      </span>
      <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
    </div>
  );
}

