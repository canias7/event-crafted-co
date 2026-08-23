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

const PAGE = "#f4f1ea";
const CARD = "#fbf9f4";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const BORDER = "#e6e1d5";
const GOLD = "#c9a86a";
const GOLD_SOFT = "#eadfc6";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

// Feature comparison per the reference mock — static marketing copy,
// independent of the Stripe catalog (prices stay DB-driven).
const COMPARISON: { label: string; free: boolean; pro: boolean; premium: boolean }[] = [
  { label: "Calendar & availability", free: true, pro: true, premium: true },
  { label: "Block unavailable dates", free: true, pro: true, premium: true },
  { label: "Appointment types (1 / 5 / unlimited)", free: true, pro: true, premium: true },
  { label: "Working hours & custom availability", free: false, pro: true, premium: true },
  { label: "Buffers, notice & daily limits", free: false, pro: true, premium: true },
  { label: "Vendora CRM & V2V messaging", free: false, pro: true, premium: true },
  { label: "Automated replies & reminders", free: false, pro: false, premium: true },
  { label: "Follow-ups & review requests", free: false, pro: false, premium: true },
  { label: "AI employee (HILUX)", free: false, pro: false, premium: true },
  { label: "Fill Your Calendar alerts", free: false, pro: false, premium: true },
];

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
      "Verify your email first",
      "Check your inbox for the verification link before making a purchase — Stripe sends receipts to your email.",
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
          "Something went wrong",
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
        `Switch to ${tier.name}?`,
        `You'll be charged $${tier.priceMonthly.toFixed(2)} today and start a fresh ${
          tier.billingInterval === "year" ? "12-month" : "30-day"
        } cycle. Time you already paid for stays with you.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Confirm switch", onPress: () => void confirmTierSwitch(tier) },
        ],
      );
      return;
    }
    void runStripeFlow(
      `tier_${tier.id}`,
      "stripe-subscription-checkout",
      { price_id: tier.priceId },
      "Couldn't start checkout.",
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
          "Couldn't switch plan",
          await fnErrorMessage(error, "Please try again in a moment."),
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
            ? "You're already on this plan."
            : "No changes made.",
        );
      } else if (result.charge_failed) {
        // Tier swapped + credits landed but the card charge failed —
        // surface it honestly so the vendor fixes the card via
        // Manage billing instead of seeing a fake success.
        Alert.alert(
          `Switched to ${tier.name}, but the card charge failed`,
          result.charge_failed === "no_payment_method_on_file"
            ? "No card on file. Open Manage billing to add one."
            : `Stripe: ${result.charge_failed}`,
        );
      } else {
        Alert.alert(
          `Switched to ${tier.name}`,
          `$${((result.charged_now_cents ?? 0) / 100).toFixed(2)} charged today. Your new plan is active.`,
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
      "Couldn't start top-up checkout.",
    );
  }

  function openPortal() {
    if (!user || acting) return;
    void runStripeFlow(
      "portal",
      "stripe-customer-portal",
      {},
      "Couldn't open the billing portal.",
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
    ? new Date(plan.currentPeriodEnd).toLocaleDateString(undefined, {
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
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
      >
        <Wordmark />
        <Text
          style={{
            marginTop: 14,
            fontFamily: SERIF,
            fontSize: 38,
            fontWeight: "700",
            letterSpacing: -0.5,
            color: INK,
          }}
        >
          Subscription <Text style={{ color: GOLD, fontSize: 13 }}>✦</Text>
        </Text>
        <Text style={{ marginTop: 4, marginBottom: 24, fontSize: 13.5, lineHeight: 19, color: INK_DIM }}>
          Plans and billing
        </Text>

        {/* Current plan + credits summary */}
        <View
          style={{
            backgroundColor: INK,
            borderRadius: 20,
            padding: 20,
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "600" }}>
            Current plan
          </Text>
          <Text style={{ color: "#ffffff", fontSize: 30, fontFamily: SERIF, marginTop: 6 }}>
            {TIER_LABELS[currentTier] ?? currentTier}
          </Text>
          {plan?.status === "past_due" ? (
            <Text style={{ color: "#fca5a5", fontSize: 13, marginTop: 4 }}>
              Payment past due — update your card in Manage billing.
            </Text>
          ) : plan?.cancelAtPeriodEnd && renewalLabel ? (
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 }}>
              Cancels on {renewalLabel}
            </Text>
          ) : currentTier !== "free" && renewalLabel ? (
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 }}>
              Renews {renewalLabel}
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
                backgroundColor: "rgba(255,255,255,0.12)",
                borderRadius: 999,
                paddingHorizontal: 16,
                paddingVertical: 9,
                opacity: acting !== null ? 0.5 : 1,
              }}
            >
              {acting === "portal" ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Feather name="credit-card" size={14} color="#ffffff" />
              )}
              <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "600", marginLeft: 8 }}>
                Manage billing
              </Text>
            </Pressable>
          ) : null}
        </View>

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
              padding: 18,
              marginTop: 28,
            }}
          >
            <Text style={{ color: INK, fontFamily: SERIF, fontSize: 18, fontWeight: "700" }}>
              Your plan
            </Text>
            <Text style={{ color: INK_DIM, fontSize: 14, marginTop: 8, lineHeight: 20 }}>
              Your current plan is shown above and stays in sync automatically.
              What every plan includes is listed below — plan changes are made
              on your account and show up here next time you open this screen.
            </Text>
          </View>
        ) : null}

        {/* Plan list. Purchase controls are web + Android only; iOS renders
            the same cards without price or button. */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 12 }}>
          <Text style={{ color: INK, fontSize: 22, fontFamily: SERIF }}>
            {isIOS ? "What each plan includes" : "Choose a plan"}
          </Text>
          {hasYearly && !isIOS ? (
            <View
              style={{
                flexDirection: "row",
                backgroundColor: "#ece7db",
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
                    paddingHorizontal: 13,
                    paddingVertical: 6,
                    backgroundColor: billingInterval === iv ? INK : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: billingInterval === iv ? "#ffffff" : INK_DIM,
                    }}
                  >
                    {iv === "month" ? "Monthly" : "Yearly"}
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
                "✦ Smart Scheduling & Automations — New",
              ]
            : tier.highlights;
          return (
            <View
              key={`${tier.id}_${tier.billingInterval}`}
              style={{
                backgroundColor: CARD,
                borderRadius: 20,
                padding: 18,
                marginBottom: 12,
                borderWidth: isCurrent || isPremiumTier ? 1.5 : 1,
                borderColor: isCurrent ? INK : isPremiumTier ? GOLD : BORDER,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: INK, fontFamily: SERIF, fontSize: 19, fontWeight: "700" }}>
                  {tier.name}
                </Text>
                {isCurrent ? (
                  <Text style={{ color: INK, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>
                    Current
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
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#8a6f3e" }}>
                      Most popular
                    </Text>
                  </View>
                ) : null}
              </View>
              {/* Price is a purchase signal, so iOS omits it entirely
                  (Apple 3.1.1) — the feature list below still renders. */}
              {!isIOS ? (
                <>
                  <Text style={{ marginTop: 4 }}>
                    <Text style={{ color: INK, fontSize: 26, fontWeight: "700" }}>
                      ${monthlyShown.toFixed(2)}
                    </Text>
                    <Text style={{ color: INK_DIM, fontSize: 13 }}> / mo</Text>
                  </Text>
                  {tier.billingInterval === "year" && tier.priceMonthly > 0 ? (
                    <Text style={{ color: INK_DIM, fontSize: 11, marginTop: 2 }}>
                      ${tier.priceMonthly.toFixed(2)} billed annually
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
                      color={h.startsWith("✦") ? GOLD : INK}
                      style={{ marginTop: 2 }}
                    />
                    <Text
                      style={{
                        color: h.startsWith("✦") ? "#8a6f3e" : INK,
                        fontSize: 13,
                        marginLeft: 7,
                        flex: 1,
                        fontWeight: h.startsWith("✦") ? "700" : "400",
                      }}
                    >
                      {h.startsWith("✦") ? h.slice(1).trim() : h}
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
                    paddingVertical: 12,
                    alignItems: "center",
                    backgroundColor:
                      isCurrent || !tier.priceId ? BORDER : INK,
                    opacity: acting !== null && !isActing ? 0.5 : 1,
                  }}
                >
                  {isActing ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: isCurrent || !tier.priceId ? INK_DIM : "#ffffff",
                      }}
                    >
                      {isCurrent
                        ? "Current plan"
                        : !tier.priceId
                          ? "Free — default"
                          : currentTier !== "free"
                            ? `Switch to ${tier.name}`
                            : `Choose ${tier.name}`}
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
            <Text style={{ color: INK, fontSize: 22, fontFamily: SERIF, marginTop: 20 }}>
              Top up credits
            </Text>
            <Text style={{ color: INK_DIM, fontSize: 13, marginTop: 4, marginBottom: 12 }}>
              One-time purchase. Credits never expire.
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
                    marginBottom: 10,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: INK, fontSize: 15, fontWeight: "700" }}>
                      {pack.name}
                    </Text>
                    <Text style={{ color: INK_DIM, fontSize: 12, marginTop: 2 }}>
                      {pack.credits.toLocaleString()} credits · $
                      {pack.price}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => buyTopup(pack)}
                    disabled={acting !== null}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 16,
                      paddingVertical: 9,
                      backgroundColor: INK,
                      opacity: acting !== null && !isActing ? 0.5 : 1,
                      minWidth: 64,
                      alignItems: "center",
                    }}
                  >
                    {isActing ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "700" }}>
                        Buy
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </>
        ) : null}

        {/* Feature comparison */}
        <Text style={{ color: INK, fontSize: 22, fontFamily: SERIF, marginTop: 24 }}>
          Compare plans
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
              backgroundColor: "#f3ecdd",
            }}
          >
            <Text style={{ flex: 1, color: INK_DIM, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>
              Feature
            </Text>
            {["Free", "Pro", "Premium"].map((h) => (
              <Text
                key={h}
                style={{ width: 58, textAlign: "center", color: INK_DIM, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}
              >
                {h}
              </Text>
            ))}
          </View>
          {COMPARISON.map((row, i) => (
            <View
              key={row.label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 11,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: BORDER,
              }}
            >
              <Text style={{ flex: 1, color: INK, fontSize: 13, paddingRight: 8 }}>
                {row.label}
              </Text>
              {[row.free, row.pro, row.premium].map((on, j) => (
                <View key={j} style={{ width: 58, alignItems: "center" }}>
                  {on ? (
                    <Feather name="check" size={15} color={j === 2 ? GOLD : INK} />
                  ) : (
                    <Text style={{ color: "#c9c4b6", fontSize: 13 }}>—</Text>
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
          <Text style={{ color: GOLD, fontSize: 13, marginRight: 7 }}>✦</Text>
          <Text style={{ color: INK_DIM, fontSize: 12, flex: 1, lineHeight: 17 }}>
            All plans include secure payments, support from a real person, and
            continuous updates.
          </Text>
        </View>

        <Text style={{ color: INK_DIM, fontSize: 11, marginTop: 12, paddingHorizontal: 4 }}>
          {isIOS
            ? "Subscriptions and credits are managed on eventvendora.com. Your current plan is shown above and stays in sync with the app."
            : "Billing is handled securely by Stripe on eventvendora.com. You'll get an email receipt for each charge."}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
