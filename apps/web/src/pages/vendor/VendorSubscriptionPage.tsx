import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Crown, Loader2, Sparkles, Flame } from "lucide-react";
import { StudioVerifiedBadge } from "@/components/vendor/StudioVerifiedBadge";
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

// Subscription + top-up catalog is fetched from
// public.vendor_credit_packages at runtime now. Going live = re-seed
// the table with live-mode Stripe price IDs + flip STRIPE_SECRET_KEY
// — no code change here. The Free tier stays hardcoded since it
// has no Stripe price (no checkout, nothing to keep in sync).
//
// wasMonthly is the anchor price we render as a strikethrough above
// the current price — frames launch pricing as a discount. Pure
// marketing copy, lives on vendor_credit_packages.was_monthly_cents.

type TierId = "free" | "starter" | "pro" | "studio";

interface TierRow {
  id: TierId;
  name: string;
  priceMonthly: number;
  wasMonthly?: number;
  priceId: string | null; // null = Free (no checkout)
  monthlyCredits: number;
  listings: string;
  highlights: string[];
}

interface TopupRow {
  id: string;
  name: string;
  credits: number;
  price: number;
  priceId: string;
}

const FREE_TIER: TierRow = {
  id: "free",
  name: "Free",
  priceMonthly: 0,
  priceId: null,
  monthlyCredits: 0,
  listings: "1 listing",
  highlights: ["100 trial credits on signup"],
};

// Maps the DB display_name -> the short label used on top-up cards
// ("Vendora Credits Boost Pack" -> "Boost"). Keeps the card title
// punchy without forcing marketing to edit DB rows.
const TOPUP_SHORT_NAMES: Record<string, string> = {
  "Vendora Credits Boost Pack": "Boost",
  "Vendora Credits Power Pack": "Power",
  "Vendora Credits Pro Pack": "Pro Pack",
  "Vendora Credits Studio Pack": "Studio Pack",
};

// Same for subscription tier display name -> short card label.
const TIER_SHORT_NAMES: Record<string, string> = {
  "Vendora Starter": "Starter",
  "Vendora Pro": "Pro",
  "Vendora Studio": "Studio",
};

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
  // Catalog state. Starts with just the Free tier + empty top-ups
  // so first paint still shows something while the DB fetch lands.
  const [tiers, setTiers] = useState<TierRow[]>([FREE_TIER]);
  const [topups, setTopups] = useState<TopupRow[]>([]);

  // Load the live catalog from vendor_credit_packages. Goes live cut-
  // over = reseed that table; this page picks up the new IDs on next
  // mount without a redeploy.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vendor_credit_packages")
        .select(
          "stripe_price_id, kind, tier, credits, display_name, unit_amount_cents, was_monthly_cents, listings_copy, highlights, display_order",
        )
        .eq("active", true)
        .order("display_order", { ascending: true });
      if (cancelled || error || !data) return;
      const subs: TierRow[] = (data as Array<{
        stripe_price_id: string;
        kind: string;
        tier: TierId | null;
        credits: number;
        display_name: string;
        unit_amount_cents: number;
        was_monthly_cents: number | null;
        listings_copy: string | null;
        highlights: string[] | null;
      }>)
        .filter((r) => r.kind === "subscription" && r.tier)
        .map((r) => ({
          id: r.tier as TierId,
          name: TIER_SHORT_NAMES[r.display_name] ?? r.display_name,
          priceMonthly: r.unit_amount_cents / 100,
          wasMonthly: r.was_monthly_cents ? r.was_monthly_cents / 100 : undefined,
          priceId: r.stripe_price_id,
          monthlyCredits: r.credits,
          listings: r.listings_copy ?? "",
          highlights: Array.isArray(r.highlights) ? r.highlights : [],
        }));
      const packs: TopupRow[] = (data as Array<{
        stripe_price_id: string;
        kind: string;
        credits: number;
        display_name: string;
        unit_amount_cents: number;
      }>)
        .filter((r) => r.kind === "topup")
        .map((r) => ({
          id: r.stripe_price_id,
          name: TOPUP_SHORT_NAMES[r.display_name] ?? r.display_name,
          credits: r.credits,
          price: r.unit_amount_cents / 100,
          priceId: r.stripe_price_id,
        }));
      setTiers([FREE_TIER, ...subs]);
      setTopups(packs);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const vendorId = ownListing?.id ?? null;
  const credits = useVendorCredits(user?.id ?? null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setPlan(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Subscription state lives on profiles (per-user) post migration
    // 20260524000000. The old vendor_profiles.subscription_* columns
    // are deprecated and won't be updated by the webhook anymore.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("profiles")
      .select(
        "subscription_tier, subscription_status, subscription_cancel_at_period_end, subscription_current_period_end, stripe_customer_id",
      )
      .eq("id", user.id)
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
  }, [user?.id]);

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
      // On an upgrade, force a Stripe → DB reconcile BEFORE the local
      // refetch. Without it the page would re-pull stale tier state
      // while waiting on the webhook to catch up — fine when the
      // webhook is healthy, broken when STRIPE_WEBHOOK_SECRET drifts.
      const refresh = async () => {
        if (upgraded) {
          try {
            await supabase.functions.invoke("stripe-sync-subscription", { body: {} });
          } catch (err) {
            console.warn("[VendorSubscriptionPage] sync failed", err);
          }
        }
        void load();
        void credits.refresh();
      };
      void refresh();
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

  async function upgradeTo(tier: TierRow) {
    if (!vendorId || actingId || !tier.priceId) return;
    setActingId(`tier_${tier.id}`);
    // If the vendor already has a paid subscription, stripe-subscription-
    // checkout rejects with "already subscribed — use the portal." Route
    // them straight to the Stripe customer portal in that case so the
    // tier switch + proration happens server-side without the user
    // having to hunt for "Manage billing" themselves.
    const alreadyPaid =
      (plan?.tier ?? "free") !== "free" &&
      (plan?.status === "active" || plan?.status === "trialing");
    if (alreadyPaid) {
      // Deep-link the portal to subscription_update_confirm for the
      // chosen tier — lands on a "confirm Pro" screen pre-filled
      // with the price diff, instead of the portal home (which leads
      // with Cancel and buries the plan switch under "Update plan").
      await callStripeFunction(
        "stripe-customer-portal",
        { vendor_id: vendorId, price_id: tier.priceId },
        "Couldn't open billing portal",
      );
    } else {
      await callStripeFunction(
        "stripe-subscription-checkout",
        { vendor_id: vendorId, price_id: tier.priceId },
        "Couldn't start checkout",
      );
    }
    setActingId(null);
  }

  async function buyTopup(pack: TopupRow) {
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
          {/* Launch-pricing hero banner — Higgsfield-style. Dark warm
              gradient, neon-amber headline, bordered countdown tiles
              on the right. Only renders while the launch offer is
              live; when offerActive flips false the whole block
              disappears and the tier cards step down to fill. */}
          {offerActive && countdown && (
            <div
              className="rounded-2xl px-6 md:px-8 py-6 md:py-7 relative overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, #2a1810 0%, #3d1f1a 45%, #4a2620 100%)",
                border: "1px solid rgba(255,138,76,0.35)",
                boxShadow: "0 12px 40px -16px rgba(255,138,76,0.35)",
              }}
            >
              {/* Soft glow accent in the top-right so the dark block
                  doesn't read as a flat rectangle. */}
              <div
                aria-hidden
                className="absolute -top-20 -right-20 w-72 h-72 rounded-full pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle, rgba(255,138,76,0.22) 0%, transparent 70%)",
                }}
              />
              <div className="relative flex items-start justify-between gap-6 flex-wrap">
                <div className="min-w-0 flex-1">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] font-bold"
                    style={{
                      background:
                        "linear-gradient(135deg, #ff8a4c 0%, #ff6b3d 100%)",
                      color: "#1a0d08",
                    }}
                  >
                    <Flame className="w-3 h-3" />
                    Launch pricing 60% off
                  </span>
                  <h2
                    className="mt-4 font-editorial leading-[0.95] text-4xl md:text-5xl"
                    style={{ color: "#ff8a4c" }}
                  >
                    Vendora Starter, Pro &amp; Studio
                  </h2>
                  <h3 className="font-editorial leading-tight text-2xl md:text-3xl text-white/90 mt-1">
                    Locked in at up to 60% off
                  </h3>
                  <p className="text-sm text-white/55 mt-3 max-w-md">
                    Lock in these rates before the offer ends. New rates apply on the
                    next billing cycle after expiry.
                  </p>
                </div>

                <div className="shrink-0">
                  <p
                    className="text-[11px] uppercase tracking-[0.12em] font-semibold mb-2 flex items-center gap-1.5"
                    style={{ color: "rgba(255,138,76,0.85)" }}
                  >
                    <Flame className="w-3 h-3" />
                    Offer expires in
                  </p>
                  <div className="flex items-stretch gap-2 tnum" aria-label="Time remaining">
                    <CountdownTile n={countdown.days} label="Days" />
                    <CountdownTile n={countdown.hours} label="Hours" pad />
                    <CountdownTile n={countdown.minutes} label="Mins" pad />
                    <CountdownTile n={countdown.seconds} label="Secs" pad />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Current-plan and AI-credits cards moved to /vendor/usage. */}

          {/* ===== Tier grid ===== */}
          <div>
            <h3 className="font-editorial text-2xl mb-3">Choose a plan</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {tiers.map((tier) => {
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
                          <span className="inline-flex items-center gap-1">
                            {h}
                            {h === "Become verified" && (
                              <StudioVerifiedBadge />
                            )}
                          </span>
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
                          {isCurrent
                            ? "Current plan"
                            : (plan?.tier ?? "free") !== "free"
                              ? `Switch to ${tier.name}`
                              : `Choose ${tier.name}`}
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
              {topups.map((pack) => {
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
                    <div className="flex-1" />
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

// Boxed countdown tile for the Higgsfield-style hero banner. Large
// number, small uppercase label underneath, hairline border around
// it so each unit reads as its own card.
function CountdownTile({
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
    <div
      className="flex flex-col items-center justify-center rounded-lg px-3 md:px-4 py-2 md:py-2.5 min-w-[58px] md:min-w-[68px]"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,138,76,0.22)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <span className="text-2xl md:text-3xl font-light tabular-nums text-white leading-none">
        {text}
      </span>
      <span className="text-[9px] uppercase tracking-[0.1em] text-white/55 mt-1.5">
        {label}
      </span>
    </div>
  );
}

