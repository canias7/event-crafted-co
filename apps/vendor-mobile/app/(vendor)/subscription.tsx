// Subscription screen — mobile mirror of the web vendor subscription
// page (apps/web/.../VendorSubscriptionPage). Vendors pick a plan,
// buy credit top-ups, and manage billing without leaving the app.
//
// Payments go through the SAME Stripe stack as web: the screen calls
// stripe-subscription-checkout / stripe-topup-checkout /
// stripe-customer-portal with platform:"vendor-mobile", opens the
// returned Stripe URL in an in-app browser session
// (expo-web-browser), and Stripe redirects to the web
// /mobile/checkout-return page which deep-links back here via the
// vendora-vendor:// scheme. Whatever way the browser closes, we
// reconcile with stripe-sync-subscription — the deep link is UX,
// not the source of truth.
//
// Catalog comes from public.vendor_credit_packages at runtime (same
// rows the web page renders), so price changes need no app update.
// Plan state lives on public.profiles (per-user, not per-listing).

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Wordmark } from "@/components/Wordmark";
import { C, IS_DARK } from "@/lib/theme";
import { PLANS_PAUSED } from "@/lib/plans";
import { useT } from "@/lib/i18n";

const PAGE = C.page;
const CARD = C.card;
const INK = C.text;
// Secondary text is the same black as headings; hierarchy comes from
// size, weight and family instead. The old value was a cool blue-grey
// (#5e636e, hue 220) which read as washed-out on the warm cream page.
const INK_DIM = C.textDim;
const BORDER = C.border;
const GOLD = C.gold;
// Disabled fill for the gold pill — solid, not faded, so
// "unavailable" never reads as "broken".
const GOLD_MUTED = C.goldMuted;
const GOLD_SOFT = C.pending;
// The current-plan summary card is a "selected" fill: ink with white
// text on light, cream with ink text on dark. onSel(a) is its label
// colour at alpha a.
const onSel = (a: number) => (IS_DARK ? `rgba(20,22,26,${a})` : `rgba(255,255,255,${a})`);
const SUMMARY_ALERT = IS_DARK ? "#b23a34" : "#fca5a5";
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

// Feature comparison per the reference mock — static marketing copy,
// independent of the Stripe catalog (prices stay DB-driven). Labels
// live in locales/<lang>/subscription.ts → comparison.<key>.
const COMPARISON: { key: string; free: boolean; pro: boolean; premium: boolean }[] = [
  { key: "calendar", free: true, pro: true, premium: true },
  { key: "blockDates", free: true, pro: true, premium: true },
  { key: "appointmentTypes", free: true, pro: true, premium: true },
  { key: "workingHours", free: false, pro: true, premium: true },
  { key: "buffers", free: false, pro: true, premium: true },
  { key: "crm", free: false, pro: true, premium: true },
  { key: "autoReplies", free: false, pro: false, premium: true },
  { key: "followUps", free: false, pro: false, premium: true },
  { key: "fillCalendar", free: false, pro: false, premium: true },
];

// Marker for the Premium card's gold "New" bullet (the text itself is
// translated at render time).
const SMART_SCHEDULING_NEW = "✦smartSchedulingNew";

// Where the web /mobile/checkout-return page bounces us back to.
// Matches the `scheme` in app.json; openAuthSessionAsync dismisses
// the browser sheet when Stripe lands on this URL.
const RETURN_URL = "vendora-vendor://checkout-return";

type TierId = "free" | "starter" | "pro" | "studio";

interface TierRow {
  id: TierId;
  name: string;
  priceMonthly: number;
  priceId: string | null; // null = Free (no checkout)
  monthlyCredits: number;
  listings: string;
  highlights: string[];
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
  highlights: ["100 MB of gallery storage", "1 listing"],
  billingInterval: "month",
};

// DB display_name -> short card label (same maps as web).
const TIER_SHORT_NAMES: Record<string, string> = {
  "Vendora Starter": "Starter",
  "Vendora Pro": "Pro",
  "Vendora Studio": "Premium",
  "Vendora Premium": "Premium",
};
const TOPUP_SHORT_NAMES: Record<string, string> = {
  "Vendora Credits Boost Pack": "Boost",
  "Vendora Credits Power Pack": "Power",
  "Vendora Credits Pro Pack": "Pro Pack",
  "Vendora Credits Studio Pack": "Studio Pack",
};

// Current-plan label for the tier slug on profiles ('studio' is
// displayed as Premium everywhere).
const TIER_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  studio: "Premium",
};

interface PlanState {
  tier: TierId;
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
}

// Pulls the error message out of a supabase.functions.invoke failure —
// edge functions return { error: "..." } bodies with non-2xx codes.
async function fnErrorMessage(
  error: { message?: string; context?: Response } | null,
  fallback: string,
): Promise<string> {
  let msg = error?.message ?? fallback;
  const ctx = error?.context;
  if (ctx && typeof ctx.text === "function") {
    try {
      const parsed = JSON.parse(await ctx.text());
      if (parsed?.error) msg = String(parsed.error);
    } catch {
      // body wasn't json
    }
  }
  return msg;
}

export default function SubscriptionScreen() {
  const { user } = useAuth();
  const { t, tObject, locale } = useT("subscription");
  // Plan bullets come from the catalog (and FREE_TIER) in English; show
  // the known ones in the app's language, anything new as written.
  const highlightLabel = (h: string) =>
    (tObject<Record<string, string>>("highlights") ?? {})[h] ?? h;

  const [plan, setPlan] = useState<PlanState | null>(null);
  const [tiers, setTiers] = useState<TierRow[]>([FREE_TIER]);
  const [topups, setTopups] = useState<TopupRow[]>([]);
  const [billingInterval, setBillingInterval] = useState<"month" | "year">(
    "month",
  );
  const [loading, setLoading] = useState(true);
  // Non-null while a checkout/portal/tier-change call is in flight —
  // disables every buy button so taps can't stack.
  const [acting, setActing] = useState<string | null>(null);

  // ----- data loading -------------------------------------------------

  // Catalog (plans + top-up packs) from vendor_credit_packages.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vendor_credit_packages")
        .select(
          "stripe_price_id, kind, tier, credits, display_name, unit_amount_cents, listings_copy, highlights, display_order, billing_interval",
        )
        .eq("active", true)
        .order("display_order", { ascending: true });
      if (cancelled || error || !data) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = data as any[];
      const subs: TierRow[] = rows
        .filter((r) => r.kind === "subscription" && r.tier)
        .map((r) => ({
          id: r.tier as TierId,
          name: TIER_SHORT_NAMES[r.display_name] ?? r.display_name,
          priceMonthly: r.unit_amount_cents / 100,
          priceId: r.stripe_price_id,
          monthlyCredits: r.credits,
          listings: r.listings_copy ?? "",
          highlights: Array.isArray(r.highlights) ? r.highlights : [],
          billingInterval: (r.billing_interval ?? "month") as "month" | "year",
        }));
      const packs: TopupRow[] = rows
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

  // Plan state (profiles). Credits deliberately don't surface on this
  // screen — the confirmed plan copy is storage/listings/features only.
  const load = useCallback(async () => {
    if (!user?.id) {
      setPlan(null);
      setLoading(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (supabase as any)
      .from("profiles")
      .select(
        "subscription_tier, subscription_status, subscription_cancel_at_period_end, subscription_current_period_end, stripe_customer_id",
      )
      .eq("id", user.id)
      .maybeSingle();
    setPlan({
      tier: (prof?.subscription_tier as TierId) ?? "free",
      status: prof?.subscription_status ?? null,
      cancelAtPeriodEnd: !!prof?.subscription_cancel_at_period_end,
      currentPeriodEnd: prof?.subscription_current_period_end ?? null,
      stripeCustomerId: prof?.stripe_customer_id ?? null,
    });
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reconcile Stripe -> DB then refetch. Runs after every browser
  // session AND on screen focus, mirroring web's belt-and-braces
  // mount sync: the grant is idempotent server-side so repeated
  // calls can't double-credit.
  const syncAndReload = useCallback(async () => {
    try {
      await supabase.functions.invoke("stripe-sync-subscription", { body: {} });
    } catch {
      // Offline / transient — the local refetch below still runs.
    }
    await load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void syncAndReload();
    }, [syncAndReload]),
  );

  // ----- purchase flows -----------------------------------------------

  // Paid actions require a verified email (matches web audit #14 —
  // Stripe sends receipts there).
  function requireVerifiedEmail(): boolean {
    if (user?.email_confirmed_at) return true;
    Alert.alert(
      t("alerts.verifyEmail.title"),
      t("alerts.verifyEmail.message"),
    );
    return false;
  }

  // Calls a checkout-ish edge function, opens the returned Stripe URL
  // in an in-app browser, and reconciles once the browser closes —
  // whether via the checkout-return deep link or a manual dismiss.
  async function runStripeFlow(
    actingKey: string,
    functionName: string,
    body: Record<string, unknown>,
    fallbackError: string,
  ) {
    if (acting) return;
    setActing(actingKey);
    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { ...body, platform: "vendor-mobile" },
      });
      const url = (data as { url?: string } | null)?.url;
      if (error || !url) {
        Alert.alert(
          t("alerts.generic"),
          await fnErrorMessage(error, fallbackError),
        );
        return;
      }
      await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
      await syncAndReload();
    } finally {
      setActing(null);
    }
  }

  function upgradeTo(tier: TierRow) {
    if (!user || !tier.priceId || acting) return;
    if (!requireVerifiedEmail()) return;
    const alreadyPaid =
      (plan?.tier ?? "free") !== "free" &&
      (plan?.status === "active" || plan?.status === "trialing");
    if (alreadyPaid) {
      // Existing subscribers switch via stripe-change-tier (charge
      // today, fresh cycle) — a second Checkout would be rejected
      // by the edge function anyway.
      Alert.alert(
        t("alerts.switch.title", { plan: tier.name }),
        tier.billingInterval === "year"
          ? t("alerts.switch.messageYear", { price: `$${tier.priceMonthly.toFixed(2)}` })
          : t("alerts.switch.messageMonth", { price: `$${tier.priceMonthly.toFixed(2)}` }),
        [
          { text: t("alerts.switch.cancel"), style: "cancel" },
          { text: t("alerts.switch.confirm"), onPress: () => void confirmTierSwitch(tier) },
        ],
      );
      return;
    }
    void runStripeFlow(
      `tier_${tier.id}`,
      "stripe-subscription-checkout",
      { price_id: tier.priceId },
      t("errors.checkout"),
    );
  }

  async function confirmTierSwitch(tier: TierRow) {
    if (!tier.priceId || acting) return;
    setActing(`tier_${tier.id}`);
    try {
      const { data, error } = await supabase.functions.invoke(
        "stripe-change-tier",
        { body: { price_id: tier.priceId } },
      );
      if (error) {
        Alert.alert(
          t("alerts.switchFailed.title"),
          await fnErrorMessage(error, t("alerts.switchFailed.message")),
        );
        return;
      }
      const result = (data ?? {}) as {
        changed?: boolean;
        granted_now?: number;
        charged_now_cents?: number;
        charge_failed?: string | null;
        reason?: string;
      };
      if (!result.changed) {
        Alert.alert(
          result.reason === "already_on_this_tier"
            ? t("alerts.alreadyOnPlan")
            : t("alerts.noChanges"),
        );
      } else if (result.charge_failed) {
        // Tier swapped + credits landed but the card charge failed —
        // surface it honestly so the vendor fixes the card via
        // Manage billing instead of seeing a fake success.
        Alert.alert(
          t("alerts.chargeFailed.title", { plan: tier.name }),
          result.charge_failed === "no_payment_method_on_file"
            ? t("alerts.chargeFailed.noCard")
            : `Stripe: ${result.charge_failed}`,
        );
      } else {
        Alert.alert(
          t("alerts.switched.title", { plan: tier.name }),
          t("alerts.switched.message", {
            amount: `$${((result.charged_now_cents ?? 0) / 100).toFixed(2)}`,
          }),
        );
      }
      await load();
    } finally {
      setActing(null);
    }
  }

  function buyTopup(pack: TopupRow) {
    if (!user || acting) return;
    if (!requireVerifiedEmail()) return;
    void runStripeFlow(
      `topup_${pack.id}`,
      "stripe-topup-checkout",
      { price_id: pack.priceId },
      t("errors.topup"),
    );
  }

  function openPortal() {
    if (!user || acting) return;
    void runStripeFlow(
      "portal",
      "stripe-customer-portal",
      {},
      t("errors.portal"),
    );
  }

  // ----- render ---------------------------------------------------------

  // On iOS, Apple guideline 3.1.1 forbids selling digital subscriptions /
  // credits through any payment system other than Apple In-App Purchase —
  // including opening Stripe in a web view or linking out to the web to buy.
  // So the iOS build is a read-only companion: it shows the vendor's current
  // plan (synced from the web) but exposes no purchase, tier-switch, top-up,
  // or billing-portal actions. Vendors manage billing on eventvendora.com.
  // Web and Android keep the full Stripe purchasing flow below.
  const isIOS = Platform.OS === "ios";

  const currentTier = plan?.tier ?? "free";
  const hasBilling = currentTier !== "free" && Boolean(plan?.stripeCustomerId);
  const hasYearly = tiers.some(
    (t) => t.id !== "free" && t.billingInterval === "year",
  );
  const visibleTiers = tiers.filter(
    (t) => t.id === "free" || t.billingInterval === billingInterval,
  );
  const renewalLabel = plan?.currentPeriodEnd
    ? new Date(plan.currentPeriodEnd).toLocaleDateString(locale, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  if (loading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: PAGE, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 132 }}
        showsVerticalScrollIndicator={false}
      >
        <Wordmark />
        <Text
          style={{
            marginTop: 16,
            fontFamily: SERIF_BOLD,
            fontSize: 38,
            letterSpacing: -0.5,
            color: INK,
          }}
        >
          {t("title")}
        </Text>
        <Text style={{ fontFamily: SERIF, marginTop: 4, marginBottom: 24, fontSize: 13, lineHeight: 19, color: INK_DIM }}>
          {t("subtitle")}
        </Text>

        {/* Current plan + credits summary */}
        <View
          style={{
            backgroundColor: C.selected,
            borderRadius: 20,
            padding: 16,
          }}
        >
          <Text style={{ fontFamily: SERIF_BOLD, color: onSel(0.6), fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2}}>
            {t("currentPlan")}
          </Text>
          <Text style={{ color: C.onSelected, fontSize: 30, fontFamily: SERIF_BOLD, marginTop: 6 }}>
            {TIER_LABELS[currentTier] ?? currentTier}
          </Text>
          {plan?.status === "past_due" ? (
            <Text style={{ fontFamily: SERIF, color: SUMMARY_ALERT, fontSize: 13, marginTop: 4 }}>
              {t("pastDue")}
            </Text>
          ) : plan?.cancelAtPeriodEnd && renewalLabel ? (
            <Text style={{ fontFamily: SERIF, color: onSel(0.7), fontSize: 13, marginTop: 4 }}>
              {t("cancelsOn", { date: renewalLabel })}
            </Text>
          ) : currentTier !== "free" && renewalLabel ? (
            <Text style={{ fontFamily: SERIF, color: onSel(0.7), fontSize: 13, marginTop: 4 }}>
              {t("renews", { date: renewalLabel })}
            </Text>
          ) : null}

          {hasBilling && !isIOS ? (
            <Pressable
              onPress={openPortal}
              disabled={acting !== null}
              style={{
                marginTop: 16,
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                backgroundColor:
                  acting !== null
                    ? onSel(0.06)
                    : onSel(0.12),
                borderRadius: 999,
                paddingHorizontal: 16,
                height: 36,
              }}
            >
              {acting === "portal" ? (
                <ActivityIndicator size="small" color={C.onSelected} />
              ) : (
                <Feather name="credit-card" size={14} color={C.onSelected} />
              )}
              <Text style={{ fontFamily: SERIF_BOLD, color: C.onSelected, fontSize: 13, marginLeft: 8 }}>
                {t("manageBilling")}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Paid plans paused (lib/plans.ts): no plan cards, toggle,
            top-ups or comparison, just this note. The current-plan card
            above (with Manage billing) stays for anyone who already pays. */}
        {PLANS_PAUSED ? (
          <View
            style={{
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 20,
              padding: 16,
              marginTop: 28,
            }}
          >
            <Text style={{ color: INK, fontFamily: SERIF_BOLD, fontSize: 18 }}>
              {t("paused.title")}
            </Text>
            <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 14, marginTop: 8, lineHeight: 20 }}>
              {t("paused.body")}
            </Text>
            {hasBilling ? (
              <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 14, marginTop: 8, lineHeight: 20 }}>
                {isIOS ? t("paused.continuesIos") : t("paused.continues")}
              </Text>
            ) : null}
          </View>
        ) : null}

        {!PLANS_PAUSED ? (
        <>
        {/* iOS: no purchase surface at all (Apple 3.1.1). Apple rejected both
            the in-app Stripe checkout AND a button linking out to the web, so
            the iOS build carries no purchase link, button, price, or call to
            action of any kind. It DOES show what every plan includes — feature
            lists and the comparison table are information, not a purchase
            surface — so vendors can see what they'd get without leaving the
            app. Everything below is rendered read-only on iOS. */}
        {isIOS ? (
          <View
            style={{
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 20,
              padding: 16,
              marginTop: 28,
            }}
          >
            <Text style={{ color: INK, fontFamily: SERIF_BOLD, fontSize: 18 }}>
              {t("ios.title")}
            </Text>
            <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 14, marginTop: 8, lineHeight: 20 }}>
              {t("ios.body")}
            </Text>
          </View>
        ) : null}

        {/* Plan list. Purchase controls are web + Android only; iOS renders
            the same cards without price or button. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", marginTop: 32, marginBottom: 12 }}>
          <Text style={{ flexShrink: 1, color: INK, fontSize: 20, fontFamily: SERIF }}>
            {isIOS ? t("plansIncluded") : t("choosePlan")}
          </Text>
          {hasYearly && !isIOS ? (
            <View
              style={{
                flexDirection: "row",
                backgroundColor: C.surface,
                borderRadius: 999,
                padding: 3,
              }}
            >
              {(["month", "year"] as const).map((iv) => (
                <Pressable
                  key={iv}
                  onPress={() => setBillingInterval(iv)}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    backgroundColor: billingInterval === iv ? C.selected : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: SERIF_BOLD,
                      fontSize: 12,
                      color: billingInterval === iv ? C.onSelected : INK_DIM,
                    }}
                  >
                    {iv === "month" ? t("monthly") : t("yearly")}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {visibleTiers.map((tier) => {
          const isCurrent = currentTier === tier.id;
          const isActing = acting === `tier_${tier.id}`;
          const isPremiumTier = tier.id === "studio";
          const monthlyShown =
            tier.billingInterval === "year"
              ? tier.priceMonthly / 12
              : tier.priceMonthly;
          // The DB highlights row also carries a plain "Smart Scheduling"
          // bullet (web parity) — swap it for the gold "New" version here.
          const bullets = isPremiumTier
            ? [
                ...tier.highlights.filter(
                  (h) => !/smart scheduling/i.test(h),
                ),
                SMART_SCHEDULING_NEW,
              ]
            : tier.highlights;
          return (
            <View
              key={`${tier.id}_${tier.billingInterval}`}
              style={{
                backgroundColor: CARD,
                borderRadius: 20,
                padding: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: isCurrent ? INK : isPremiumTier ? GOLD : BORDER,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: INK, fontFamily: SERIF_BOLD, fontSize: 18 }}>
                  {tier.name}
                </Text>
                {isCurrent ? (
                  <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                    {t("current")}
                  </Text>
                ) : isPremiumTier ? (
                  <View
                    style={{
                      backgroundColor: GOLD_SOFT,
                      borderRadius: 999,
                      paddingHorizontal: 11,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ fontFamily: SERIF_BOLD, fontSize: 11, color: C.pendingText }}>
                      {t("mostPopular")}
                    </Text>
                  </View>
                ) : null}
              </View>
              {/* Price is a purchase signal, so iOS omits it entirely
                  (Apple 3.1.1) — the feature list below still renders. */}
              {!isIOS ? (
                <>
                  <Text style={{ fontFamily: SERIF, marginTop: 4 }}>
                    <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 24}}>
                      ${monthlyShown.toFixed(2)}
                    </Text>
                    <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 13 }}> {t("perMonth")}</Text>
                  </Text>
                  {tier.billingInterval === "year" && tier.priceMonthly > 0 ? (
                    <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 11, marginTop: 2 }}>
                      {t("billedAnnually", { price: `$${tier.priceMonthly.toFixed(2)}` })}
                    </Text>
                  ) : null}
                </>
              ) : null}
              {/* Cards show only the confirmed plan bullets — listings
                  live in highlights now and credits are hidden from
                  marketing copy (still visible on the plan summary). */}
              <View style={{ marginTop: 12, gap: 6 }}>
                {bullets.map((h) => (
                  <View key={h} style={{ flexDirection: "row", alignItems: "flex-start" }}>
                    <Feather
                      name="check"
                      size={13}
                      color={h === SMART_SCHEDULING_NEW ? GOLD : INK}
                      style={{ marginTop: 2 }}
                    />
                    <Text
                      style={{
                        fontFamily: h === SMART_SCHEDULING_NEW ? SERIF_BOLD : SERIF,
                        color: h === SMART_SCHEDULING_NEW ? C.accentText : INK,
                        fontSize: 13,
                        marginLeft: 7,
                        flex: 1,
                      }}
                    >
                      {h === SMART_SCHEDULING_NEW ? t("smartSchedulingNew") : highlightLabel(h)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* No purchase CTA on iOS (Apple 3.1.1). */}
              {!isIOS ? (
                <Pressable
                  onPress={() => upgradeTo(tier)}
                  disabled={acting !== null || isCurrent || !tier.priceId}
                  style={{
                    marginTop: 16,
                    borderRadius: 999,
                    height: 44,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor:
                      isCurrent || !tier.priceId
                        ? BORDER
                        : acting !== null && !isActing
                          ? GOLD_MUTED
                          : GOLD,
                  }}
                >
                  {isActing ? (
                    <ActivityIndicator size="small" color={C.onGold} />
                  ) : (
                    <Text
                      style={{
                        fontFamily: SERIF_BOLD,
                        fontSize: 14,
                        color: isCurrent || !tier.priceId ? INK_DIM : C.onGold,
                      }}
                    >
                      {isCurrent
                        ? t("cta.current")
                        : !tier.priceId
                          ? t("cta.freeDefault")
                          : currentTier !== "free"
                            ? t("cta.switch", { plan: tier.name })
                            : t("cta.choose", { plan: tier.name })}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          );
        })}

        {/* Top-up packs — a purchase surface, so web + Android only. */}
        {!isIOS && topups.length > 0 ? (
          <>
            <Text style={{ color: INK, fontSize: 20, fontFamily: SERIF, marginTop: 24 }}>
              {t("topup.title")}
            </Text>
            <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 13, marginTop: 4, marginBottom: 12 }}>
              {t("topup.subtitle")}
            </Text>
            {topups.map((pack) => {
              const isActing = acting === `topup_${pack.id}`;
              return (
                <View
                  key={pack.id}
                  style={{
                    backgroundColor: CARD,
                    borderWidth: 1,
                    borderColor: BORDER,
                    borderRadius: 20,
                    padding: 16,
                    marginBottom: 12,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 15}}>
                      {pack.name}
                    </Text>
                    <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 12, marginTop: 2 }}>
                      {t("topup.credits", { count: pack.credits, credits: pack.credits.toLocaleString(locale) })} · $
                      {pack.price}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => buyTopup(pack)}
                    disabled={acting !== null}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 16,
                      height: 36,
                      justifyContent: "center",
                      backgroundColor:
                        acting !== null && !isActing ? GOLD_MUTED : GOLD,
                      minWidth: 64,
                      alignItems: "center",
                    }}
                  >
                    {isActing ? (
                      <ActivityIndicator size="small" color={C.onGold} />
                    ) : (
                      <Text style={{ fontFamily: SERIF_BOLD, color: C.onGold, fontSize: 13}}>
                        {t("topup.buy")}
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </>
        ) : null}

        {/* Feature comparison */}
        <Text style={{ color: INK, fontSize: 20, fontFamily: SERIF, marginTop: 24 }}>
          {t("compare.title")}
        </Text>
        <View
          style={{
            marginTop: 12,
            backgroundColor: CARD,
            borderWidth: 1,
            borderColor: BORDER,
            borderRadius: 20,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 12,
              backgroundColor: C.pending,
            }}
          >
            <Text style={{ fontFamily: SERIF_BOLD, flex: 1, color: INK_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>
              {t("compare.feature")}
            </Text>
            {["Free", "Pro", "Premium"].map((h) => (
              <Text
                key={h}
                style={{ fontFamily: SERIF_BOLD, width: 58, textAlign: "center", color: INK_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}
              >
                {h}
              </Text>
            ))}
          </View>
          {COMPARISON.map((row, i) => (
            <View
              key={row.key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 11,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: BORDER,
              }}
            >
              <Text style={{ fontFamily: SERIF, flex: 1, color: INK, fontSize: 13, paddingRight: 8 }}>
                {t(`comparison.${row.key}`)}
              </Text>
              {[row.free, row.pro, row.premium].map((on, j) => (
                <View key={j} style={{ width: 58, alignItems: "center" }}>
                  {on ? (
                    <Feather name="check" size={15} color={j === 2 ? GOLD : INK} />
                  ) : (
                    <Text style={{ fontFamily: SERIF, color: C.placeholder, fontSize: 13 }}>—</Text>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            marginTop: 12,
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 12, flex: 1, lineHeight: 17 }}>
            {t("compare.footnote")}
          </Text>
        </View>

        <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 11, marginTop: 12, paddingHorizontal: 4 }}>
          {isIOS ? t("billingNoteIos") : t("billingNote")}
        </Text>
        </>
        ) : hasBilling && !isIOS ? (
          <Text style={{ fontFamily: SERIF, color: INK_DIM, fontSize: 11, marginTop: 12, paddingHorizontal: 4 }}>
            {t("billingNote")}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
