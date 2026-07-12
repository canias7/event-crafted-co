import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Crown, Loader2, Sparkles, Flame } from "lucide-react";
import { StudioVerifiedBadge } from "@/components/vendor/StudioVerifiedBadge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRequireVerifiedEmail } from "@/hooks/useRequireVerifiedEmail";
import { useVendorCredits } from "@/hooks/useVendorCredits";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { vendorNavItems as navItems } from "@/data/navItems";

// Subscription + AI credits surface for the vendor.
//
// Vendora's plan model (Free / Pro / Premium):
//   Free    — 100 MB gallery storage, 1 listing.
//   Pro     — 1 GB gallery storage, 4 listings, verified profile,
//             V2V messaging, Vendora CRM. 800 AI credits/mo.
//   Premium — 5 GB gallery storage, 10 listings, AI employee (HILUX).
//             2,500 AI credits/mo.
//
// Premium keeps the legacy 'studio' tier slug internally (Stripe
// products, webhook, profiles.subscription_tier) — only display
// copy says Premium. Starter is retired: catalog rows deactivated,
// existing subscribers grandfathered.
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
  // 'month' for the monthly versions of Starter/Pro/Studio (and
  // Free, which is always free regardless), 'year' for the yearly
  // alternates we toggle to via the Monthly/Yearly switch. Same
  // tier slug can have one row per interval in vendor_credit_packages.
  billingInterval: "month" | "year";
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
  highlights: ["100 MB of gallery storage"],
  billingInterval: "month",
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
  "Vendora Studio": "Premium",
  "Vendora Premium": "Premium",
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
  // Monthly / Yearly toggle. Defaults to monthly since that's
  // what's been live; yearly tiers get seeded into
  // vendor_credit_packages with billing_interval='year' once the
  // Stripe yearly prices are created.
  const [billingInterval, setBillingInterval] = useState<"month" | "year">(
    "month",
  );

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
          "stripe_price_id, kind, tier, credits, display_name, unit_amount_cents, was_monthly_cents, listings_copy, highlights, display_order, billing_interval",
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
        billing_interval: "month" | "year" | null;
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
          billingInterval: (r.billing_interval ?? "month") as "month" | "year",
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
  // Audit #14: gate paid actions on email verification so vendors
  // can't drop money on a subscription before they've confirmed
  // the email Stripe will send receipts to.
  const requireVerified = useRequireVerifiedEmail();

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

  // Belt-and-braces reconcile: fire stripe-sync-subscription on every
  // mount, not just on ?upgraded=1. The customer portal's default
  // return_url is /vendor/subscription (no query string), so a vendor
  // who changes their plan in the portal and clicks "Done" lands here
  // without the upgraded flag — without this effect the DB would stay
  // on the old tier (and the new tier's credit grant would never
  // fire) until either the webhook caught up (broken when the signing
  // secret drifts) or they routed back through the ?upgraded=1 success
  // URL. Sync is idempotent server-side: the grant is keyed on
  // sub.id + period_start + old→new tier, so repeated mounts can't
  // double-credit.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "stripe-sync-subscription",
          { body: {} },
        );
        if (cancelled || error) return;
        const result = (data ?? {}) as { synced?: boolean; granted_now?: number };
        if (result.synced) {
          if ((result.granted_now ?? 0) > 0) {
            toast.success(`+${(result.granted_now ?? 0).toLocaleString()} credits — plan synced.`);
          }
          await load();
          await credits.refresh();
        }
      } catch (err) {
        console.warn("[VendorSubscriptionPage] mount sync failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // load + credits are stable enough; we only want to fire once per
    // user session on this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Refetch on Stripe redirects (?upgraded=1, ?topup=1, etc.).
  useEffect(() => {
    const upgraded = search.get("upgraded");
    const cancelled = search.get("cancelled");
    const topup = search.get("topup");
    const topupCancelled = search.get("topup_cancelled");
    if (upgraded || cancelled || topup || topupCancelled) {
      if (upgraded) toast.success("Thanks for upgrading — plan is active.");
      if (topup) toast.success("Credits added to your balance.");
      // Audit #11: silent cancels confused vendors ("did I buy or
      // not?"). Acknowledge the abort so the page change isn't a
      // ghost interaction.
      if (cancelled) toast("Checkout cancelled — no changes made.");
      if (topupCancelled) toast("Top-up cancelled — no changes made.");
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
    // Audit #11: skip the optimistic window.open — Safari blocks it
    // because the call happens after `await`. Same-tab navigation is
    // simpler and works everywhere; the Stripe page returns to us
    // via the configured return_url anyway.
    const { data, error } = await supabase.functions.invoke(functionName, { body });
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
      toast.error(msg);
      return null;
    }
    const url = (data as { url?: string } | null)?.url;
    if (!url) {
      toast.error("Couldn't open the billing portal — try again in a moment.");
      return null;
    }
    window.location.href = url;
    return url;
  }

  // Modal state for the "switch plan?" confirmation. Lifted out of
  // the click handler so we can render a proper AlertDialog instead
  // of the browser-native window.confirm (which looks broken next
  // to the rest of the app's styling).
  const [pendingTier, setPendingTier] = useState<TierRow | null>(null);

  // Billing summary (card on file + recent invoices) rendered in the
  // right-side panel next to the launch-offer hero. Fetched lazily
  // from stripe-billing-info edge fn on mount + after any tier change.
  interface BillingInfo {
    card: { brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null } | null;
    invoices: Array<{
      id: string;
      number: string | null;
      created: number;
      amount_paid: number;
      amount_due: number;
      currency: string;
      status: string;
      summary: string | null;
      lines?: Array<{ description: string | null; amount: number }>;
      subtotal?: number;
      tax?: number;
      hosted_invoice_url: string | null;
      invoice_pdf: string | null;
    }>;
  }
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const refreshBilling = useCallback(async () => {
    if (!user?.id) {
      setBilling(null);
      setBillingLoading(false);
      return;
    }
    setBillingLoading(true);
    try {
      const { data } = await supabase.functions.invoke("stripe-billing-info", {
        body: {},
      });
      if (data) setBilling(data as BillingInfo);
    } catch (err) {
      console.warn("[VendorSubscriptionPage] billing fetch failed", err);
    } finally {
      setBillingLoading(false);
    }
  }, [user?.id]);
  useEffect(() => {
    void refreshBilling();
  }, [refreshBilling]);

  async function upgradeTo(tier: TierRow) {
    // Audit #5: don't gate on vendorId — a freshly-signed-up vendor
    // with no listings yet still needs to subscribe. Edge functions
    // accept missing vendor_id and treat the JWT user as the admin.
    if (!user || actingId || !tier.priceId) return;
    if (!requireVerified("upgrading your plan")) return;
    const alreadyPaid =
      (plan?.tier ?? "free") !== "free" &&
      (plan?.status === "active" || plan?.status === "trialing");
    if (alreadyPaid) {
      // Open the themed confirmation modal. The actual call to
      // stripe-change-tier fires from confirmTierSwitch below when
      // the user clicks "Confirm switch".
      setPendingTier(tier);
      return;
    }
    setActingId(`tier_${tier.id}`);
    await callStripeFunction(
      "stripe-subscription-checkout",
      { vendor_id: vendorId ?? null, price_id: tier.priceId },
      "Couldn't start checkout",
    );
    setActingId(null);
  }

  async function confirmTierSwitch() {
    const tier = pendingTier;
    if (!tier || !tier.priceId || !user) return;
    setPendingTier(null);
    setActingId(`tier_${tier.id}`);
    try {
      const { data, error } = await supabase.functions.invoke(
        "stripe-change-tier",
        { body: { price_id: tier.priceId } },
      );
      if (error) {
        toast.error("Couldn't switch plan", {
          description: error.message ?? "Please try again in a moment.",
        });
        return;
      }
      const result = (data ?? {}) as {
        changed?: boolean;
        new_tier?: string;
        granted_now?: number;
        charged_now_cents?: number;
        charge_failed?: string | null;
        reason?: string;
      };
      if (!result.changed) {
        toast(
          result.reason === "already_on_this_tier"
            ? "You're already on this plan."
            : "No changes made.",
        );
      } else if (result.charge_failed) {
        // Tier did swap + credits did land — but the card charge
        // failed. Surface that honestly so the vendor can update
        // their card via "Manage billing" instead of seeing a fake
        // success.
        toast.warning(
          `Switched to ${tier.name}, but the card charge failed.`,
          {
            description:
              result.charge_failed === "no_payment_method_on_file"
                ? "No card on file. Open Manage billing to add one."
                : `Stripe: ${result.charge_failed}`,
          },
        );
      } else {
        const dollars = ((result.charged_now_cents ?? 0) / 100).toFixed(2);
        const credits = (result.granted_now ?? 0).toLocaleString();
        toast.success(
          `Switched to ${tier.name} — $${dollars} charged today, +${credits} credits added.`,
        );
      }
      await load();
      await credits.refresh();
      void refreshBilling();
    } catch (err) {
      toast.error("Couldn't switch plan", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setActingId(null);
    }
  }

  async function buyTopup(pack: TopupRow) {
    if (!user || actingId) return;
    if (!requireVerified("buying a top-up")) return;
    setActingId(`topup_${pack.id}`);
    await callStripeFunction(
      "stripe-topup-checkout",
      { vendor_id: vendorId ?? null, price_id: pack.priceId },
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

  // Biggest SAVE% across the tiers in the CURRENTLY selected interval,
  // so the launch hero ("up to N% off") matches what the cards show.
  // Monthly anchors are aggressive (~60%); yearly is the real ~17% vs
  // 12x monthly — the hero must not overstate yearly savings.
  const maxSavePct = useMemo(() => {
    const pcts = tiers
      .filter(
        (t) =>
          t.id !== "free" &&
          t.billingInterval === billingInterval &&
          t.wasMonthly &&
          t.wasMonthly > t.priceMonthly,
      )
      .map((t) => Math.round((1 - t.priceMonthly / (t.wasMonthly as number)) * 100));
    return pcts.length ? Math.max(...pcts) : 0;
  }, [tiers, billingInterval]);

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />

      <main id="main-content" className="flex-1 pb-24 lg:pb-0 relative">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5 sticky top-0 z-40">
          <h1 className="font-editorial text-3xl">Subscription</h1>
          <p className="text-sm text-muted-foreground">
            Pick a plan or top up credits. Track usage on the Usage tab.
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-6xl space-y-5">
          {/* Top row: launch-pricing hero on the left, billing panel
              (card on file + recent invoices) on the right. Stacks
              on small screens; side-by-side at lg. If the launch
              offer has expired (offerActive false) the billing panel
              expands to fill the row. */}
          <div className="flex flex-col lg:flex-row gap-5 items-stretch">
          {offerActive && countdown && (
            <div
              className="flex-1 min-w-0 rounded-2xl px-6 md:px-8 py-6 md:py-7 relative overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, #18181b 0%, #27272a 45%, #3f3f46 100%)",
                border: "1px solid rgba(0,0,0,0.35)",
                boxShadow: "0 12px 40px -16px rgba(0,0,0,0.35)",
              }}
            >
              {/* Soft glow accent in the top-right so the dark block
                  doesn't read as a flat rectangle. */}
              <div
                aria-hidden
                className="absolute -top-20 -right-20 w-72 h-72 rounded-full pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle, rgba(0,0,0,0.08) 0%, transparent 70%)",
                }}
              />
              <div className="relative flex items-start justify-between gap-6 flex-wrap">
                <div className="min-w-0 flex-1">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] font-bold"
                    style={{
                      background:
                        "linear-gradient(135deg, #e4e4e7 0%, #ffffff 100%)",
                      color: "#18181b",
                    }}
                  >
                    <Flame className="w-3 h-3" />
                    Launch pricing {maxSavePct}% off
                  </span>
                  <h2
                    className="mt-4 font-editorial leading-[0.95] text-4xl md:text-5xl"
                    style={{ color: "#fafafa" }}
                  >
                    Vendora Pro &amp; Premium
                  </h2>
                  <h3 className="font-editorial leading-tight text-2xl md:text-3xl text-white/90 mt-1">
                    Locked in at up to {maxSavePct}% off
                  </h3>
                  <p className="text-sm text-white/55 mt-3 max-w-md">
                    Lock in these rates before the offer ends. New rates apply on the
                    next billing cycle after expiry.
                  </p>
                </div>

                <div className="shrink-0">
                  <p
                    className="text-[11px] uppercase tracking-[0.12em] font-semibold mb-2 flex items-center gap-1.5"
                    style={{ color: "rgba(255,255,255,0.85)" }}
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

            {/* Billing panel — card on file + recent invoices. Renders
                next to the hero on lg, full-width below the title on
                mobile. */}
            <BillingPanel
              loading={billingLoading}
              billing={billing}
              actingId={actingId}
              setActingId={setActingId}
              vendorId={vendorId ?? null}
              hasBilling={
                (plan?.tier ?? "free") !== "free" &&
                Boolean(plan?.stripeCustomerId)
              }
            />
          </div>

          {/* Current-plan and AI-credits cards moved to /vendor/usage. */}

          {/* ===== Tier grid ===== */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h3 className="font-editorial text-2xl">Choose a plan</h3>
              <BillingIntervalToggle
                value={billingInterval}
                onChange={setBillingInterval}
              />
            </div>
            {/* Free always shows. Paid tiers filter by the selected
                interval. Yearly rows get seeded into
                vendor_credit_packages with billing_interval='year'
                when those Stripe prices exist; until then the
                toggle's Yearly side shows just Free + a 'coming
                soon' notice. */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tiers
                .filter(
                  (t) =>
                    t.id === "free" ||
                    t.billingInterval === billingInterval,
                )
                .map((tier) => {
                const isCurrent = plan?.tier === tier.id;
                const isAct = actingId === `tier_${tier.id}`;
                return (
                  <div
                    key={tier.id}
                    className="rounded-2xl p-5 flex flex-col"
                    style={{
                      background: isCurrent
                        ? "linear-gradient(135deg, rgba(0,0,0,0.035), rgba(0,0,0,0.025))"
                        : "rgba(255,255,255,0.6)",
                      border: isCurrent
                        ? "1px solid rgba(0,0,0,0.45)"
                        : "0.5px solid rgba(0,0,0,0.08)",
                      backdropFilter: "blur(10px)",
                      WebkitBackdropFilter: "blur(10px)",
                      boxShadow: isCurrent
                        ? "0 8px 28px -12px rgba(0,0,0,0.25)"
                        : "0 4px 18px -8px rgba(0,0,0,0.06)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-foreground">{tier.name}</p>
                        {tier.wasMonthly && offerActive && !isCurrent && (
                          <span
                            className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(0,0,0,0.08)", color: "#18181b" }}
                          >
                            Save {Math.round((1 - tier.priceMonthly / tier.wasMonthly) * 100)}%
                          </span>
                        )}
                      </div>
                      {isCurrent && (
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-[#18181b]">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-1">
                      {tier.wasMonthly && offerActive && (
                        <span className="text-sm text-muted-foreground line-through mr-1.5 tnum">
                          ${tier.billingInterval === "year"
                            ? (tier.wasMonthly / 12).toFixed(2)
                            : tier.wasMonthly}
                        </span>
                      )}
                      <span className="text-2xl font-semibold tnum">
                        ${tier.billingInterval === "year"
                          ? (tier.priceMonthly / 12).toFixed(2)
                          : tier.priceMonthly.toFixed(2)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        / mo
                      </span>
                    </p>
                    {tier.billingInterval === "year" && tier.priceMonthly > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 tnum">
                        ${tier.priceMonthly.toFixed(2)} billed annually
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {tier.monthlyCredits > 0
                        ? `${tier.monthlyCredits.toLocaleString()} credits/mo · ${tier.listings}`
                        : tier.listings}
                    </p>
                    {tier.wasMonthly && offerActive && !isCurrent && (
                      <p className="text-[10px] text-[#18181b] font-medium mt-0.5">
                        Launch pricing — limited time
                      </p>
                    )}

                    <ul className="mt-3 space-y-1.5 flex-1">
                      {tier.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-1.5 text-xs text-foreground/85">
                          <Check className="w-3 h-3 text-accent shrink-0 mt-[3px]" />
                          <span className="inline-flex items-center gap-1">
                            {h}
                            {(h === "Become verified" ||
                              h === "Verified profile") && (
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
            {/* If the vendor flipped to Yearly but we haven't seeded
                any yearly rows yet, paid-tier filter returns 0 cards
                (only Free shows). Surface a friendly notice so the
                section doesn't look empty. */}
            {billingInterval === "year" &&
            !tiers.some(
              (t) => t.id !== "free" && t.billingInterval === "year",
            ) ? (
              <div className="mt-3 rounded-2xl border border-dashed border-foreground/15 bg-secondary/30 p-6 text-center text-sm text-muted-foreground">
                Yearly plans coming soon — switch back to monthly to pick a
                plan today.
              </div>
            ) : null}
            <p className="text-[11px] text-muted-foreground mt-2 px-1">
              Switching plans charges the new tier today and starts a fresh
              {billingInterval === "year" ? " 12-month" : " 30-day"} cycle.
              Time you already paid for stays with you, plus the new tier's
              credits get added to your balance.
            </p>
          </div>

          {/* ===== Top-up grid ===== */}
          {/* Hidden entirely while the catalog has no top-up rows —
              the live-mode Stripe account doesn't have credit packs
              yet (old test-mode packs were wiped at go-live). Seed
              vendor_credit_packages with kind='topup' rows to bring
              this section back. */}
          {topups.length > 0 && (
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
                      background: "rgba(255,255,255,0.6)",
                      border: "0.5px solid rgba(0,0,0,0.08)",
                      backdropFilter: "blur(10px)",
                      WebkitBackdropFilter: "blur(10px)",
                      boxShadow: "0 4px 18px -8px rgba(0,0,0,0.06)",
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
          )}

          <p className="text-xs text-muted-foreground px-2">
            Billing is handled via Stripe. You'll get a receipt by email for
            each charge.
          </p>
        </div>
      </main>

      <MobileNav items={navItems} />

      <AlertDialog
        open={pendingTier !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTier(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Switch to {pendingTier?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  You'll be charged{" "}
                  <span className="font-semibold text-foreground tnum">
                    ${pendingTier?.priceMonthly}
                  </span>{" "}
                  today, then{" "}
                  <span className="font-semibold text-foreground tnum">
                    ${pendingTier?.priceMonthly}
                  </span>{" "}
                  every month after.
                </p>
                <p>
                  Any unused time on your current plan stays with you, and{" "}
                  <span className="font-semibold text-foreground tnum">
                    +{(pendingTier?.monthlyCredits ?? 0).toLocaleString()}
                  </span>{" "}
                  credits get added to your balance right away.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmTierSwitch}
              className="bg-foreground text-background hover:bg-foreground/90"
            >
              Confirm switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Boxed countdown tile for the Higgsfield-style hero banner. Large
// number, small uppercase label underneath, hairline border around
// it so each unit reads as its own card.
// Side-panel for the subscription page: card on file (with Update
// link via the customer portal), recent invoices (View opens the
// Stripe-hosted PDF), and a Cancel plan affordance. Pulls its data
// from the stripe-billing-info edge function; refreshes after any
// tier change. Renders to the right of the launch-offer hero on lg,
// stacks below on mobile.
const INVOICES_COLLAPSED = 3;

function BillingPanel({
  loading,
  billing,
  actingId,
  setActingId,
  vendorId,
  hasBilling,
}: {
  loading: boolean;
  billing: {
    card: { brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null } | null;
    invoices: Array<{
      id: string;
      number: string | null;
      created: number;
      amount_paid: number;
      amount_due: number;
      currency: string;
      status: string;
      summary: string | null;
      lines?: Array<{ description: string | null; amount: number }>;
      subtotal?: number;
      tax?: number;
      hosted_invoice_url: string | null;
      invoice_pdf?: string | null;
    }>;
  } | null;
  actingId: string | null;
  setActingId: (id: string | null) => void;
  vendorId: string | null;
  // True only when the vendor has a paid plan with a Stripe customer.
  // The portal (Update card / Cancel) 400s for free vendors who have
  // no customer yet, so those controls are hidden unless this is true.
  hasBilling: boolean;
}) {
  const [invoicesExpanded, setInvoicesExpanded] = useState(false);

  async function openPortal(action: "update" | "cancel") {
    if (actingId) return;
    setActingId(`portal_${action}`);
    try {
      const { data, error } = await supabase.functions.invoke(
        "stripe-customer-portal",
        { body: { vendor_id: vendorId ?? null } },
      );
      if (error || !data?.url) {
        toast.error("Couldn't open billing portal", {
          description: error?.message ?? "Please try again in a moment.",
        });
        return;
      }
      window.location.href = data.url as string;
    } finally {
      setActingId(null);
    }
  }

  const cardLabel = billing?.card
    ? `${(billing.card.brand ?? "card").replace(/^./, (c) => c.toUpperCase())} •••• ${billing.card.last4}`
    : "No card on file";
  const cardExp = billing?.card?.exp_month && billing?.card?.exp_year
    ? `Exp ${String(billing.card.exp_month).padStart(2, "0")}/${String(billing.card.exp_year).slice(-2)}`
    : null;
  const recentInvoices = (billing?.invoices ?? []).slice(0, 5);

  return (
    <div
      className="w-full lg:w-[360px] shrink-0 rounded-2xl p-5 md:p-6 flex flex-col"
      style={{
        background: "rgba(255,255,255,0.72)",
        border: "0.5px solid rgba(0,0,0,0.08)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 6px 24px -12px rgba(0,0,0,0.08)",
      }}
    >
      <h3 className="text-base font-semibold tracking-tight font-sans">
        Billing
      </h3>

      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Payment method
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium tnum truncate">{cardLabel}</p>
            {cardExp ? (
              <p className="text-[11px] text-muted-foreground tnum">{cardExp}</p>
            ) : null}
          </div>
          {hasBilling ? (
            <button
              type="button"
              onClick={() => openPortal("update")}
              disabled={actingId !== null}
              className="text-xs font-medium text-foreground/70 hover:text-foreground rounded-full px-2.5 py-1 border border-foreground/15 hover:border-foreground/40 transition-colors disabled:opacity-50"
            >
              Update
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Invoices
          </p>
        </div>
        {loading ? (
          <p className="text-xs text-muted-foreground mt-2">Loading…</p>
        ) : recentInvoices.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-2">
            No invoices yet. Once your first month is paid, receipts land here.
          </p>
        ) : (
          (() => {
            // Render one row per LINE ITEM, not per invoice. Some
            // historical invoices were bundled by the older
            // stripe-change-tier v2-v4 flow. Splitting per line here
            // gives vendors the "one charge = one row" view; each
            // row links back to the same Stripe-hosted receipt.
            const rows = recentInvoices.flatMap((inv) => {
              const date = new Date(inv.created * 1000);
              const paidStyle =
                inv.status === "paid"
                  ? "text-emerald-700"
                  : inv.status === "open"
                    ? "text-zinc-800"
                    : "text-muted-foreground";
              const lines = (inv.lines ?? []).filter((l) => l.amount > 0);
              if (lines.length === 0) {
                return [{
                  key: inv.id,
                  date,
                  description: inv.summary ?? `Invoice ${inv.id.slice(-6)}`,
                  amount: inv.amount_paid || inv.amount_due,
                  status: inv.status,
                  paidStyle,
                  hostedUrl: inv.hosted_invoice_url,
                  pdfUrl: inv.invoice_pdf ?? null,
                }];
              }
              return lines.map((line, lIdx) => ({
                key: `${inv.id}_${lIdx}`,
                date,
                description: line.description ?? inv.summary ?? "Line item",
                amount: line.amount,
                status: inv.status,
                paidStyle,
                hostedUrl: inv.hosted_invoice_url,
                pdfUrl: inv.invoice_pdf ?? null,
              }));
            });
            const hasMore = rows.length > INVOICES_COLLAPSED;
            // Collapsed shows the first INVOICES_COLLAPSED rows;
            // expanded shows all in a scrollable container so the
            // panel never pushes past the hero on the left.
            const visible = invoicesExpanded ? rows : rows.slice(0, INVOICES_COLLAPSED);
            return (
              <>
                <ul
                  className={`mt-2 divide-y divide-foreground/8 -mx-1 ${
                    invoicesExpanded ? "max-h-[420px] overflow-y-auto pr-1" : ""
                  }`}
                >
                  {visible.map((row) => {
                    const dateLabel = row.date.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });
                    return (
                      <li key={row.key} className="flex items-center justify-between gap-2 px-1 py-2">
                        <div className="min-w-0">
                          <p className="text-sm tnum">{dateLabel}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {row.description}
                          </p>
                          <p className={`text-[11px] capitalize tnum mt-0.5 ${row.paidStyle}`}>
                            {row.status}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold tnum">
                            ${(row.amount / 100).toFixed(2)}
                          </p>
                          {(row.hostedUrl || row.pdfUrl) && (
                            <div className="mt-1 flex items-center justify-end gap-2 text-[11px] font-medium text-foreground/60">
                              {row.hostedUrl ? (
                                <a
                                  href={row.hostedUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-foreground"
                                >
                                  View
                                </a>
                              ) : null}
                              {row.hostedUrl && row.pdfUrl ? (
                                <span aria-hidden="true" className="text-foreground/30">
                                  ·
                                </span>
                              ) : null}
                              {row.pdfUrl ? (
                                <a
                                  href={row.pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download
                                  className="hover:text-foreground"
                                  aria-label="Download PDF"
                                  title="Download PDF"
                                >
                                  PDF
                                </a>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {hasMore ? (
                  <button
                    type="button"
                    onClick={() => setInvoicesExpanded((v) => !v)}
                    className="mt-2 self-start text-xs font-medium text-foreground/70 hover:text-foreground"
                  >
                    {invoicesExpanded
                      ? "Show less"
                      : `Show all (${rows.length})`}
                  </button>
                ) : null}
              </>
            );
          })()
        )}
      </div>

      {hasBilling ? (
        <div className="mt-5 pt-4 border-t border-foreground/8">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Cancellation
          </p>
          <button
            type="button"
            onClick={() => openPortal("cancel")}
            disabled={actingId !== null}
            className="mt-1.5 text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-50"
          >
            Cancel plan
          </button>
        </div>
      ) : null}
    </div>
  );
}

// Monthly / Yearly toggle that sits next to the Choose-a-plan
// heading. Pill with two segments; the active one gets the dark
// fill. Keyboard-accessible — both segments are real buttons.
// The 'Save N%' badge on Yearly only renders when there's at
// least one yearly tier in the catalog, so we don't promise a
// discount that doesn't exist yet.
function BillingIntervalToggle({
  value,
  onChange,
}: {
  value: "month" | "year";
  onChange: (next: "month" | "year") => void;
}) {
  const cls = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
      active
        ? "bg-foreground text-background"
        : "text-foreground/70 hover:text-foreground"
    }`;
  return (
    <div
      role="radiogroup"
      aria-label="Billing interval"
      className="inline-flex items-center gap-1 rounded-full p-1 border border-foreground/12 bg-secondary/40"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === "month"}
        onClick={() => onChange("month")}
        className={cls(value === "month")}
      >
        Monthly
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "year"}
        onClick={() => onChange("year")}
        className={cls(value === "year")}
      >
        Yearly
      </button>
    </div>
  );
}

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
        border: "1px solid rgba(255,255,255,0.22)",
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

