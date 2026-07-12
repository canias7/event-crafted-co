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

const SURFACE = "#f3f4f6";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const BORDER = "#e5e7eb";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

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
  highlights: ["100 MB of gallery storage"],
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
  monthlyGrant: number;
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
  const [balance, setBalance] = useState(0);
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

  // Plan state (profiles) + credit balance (vendor_credit_balances).
  const load = useCallback(async () => {
    if (!user?.id) {
      setPlan(null);
      setLoading(false);
      return;
    }
    const [{ data: prof }, { data: bal }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("profiles")
        .select(
          "subscription_tier, subscription_status, subscription_cancel_at_period_end, subscription_current_period_end, stripe_customer_id, monthly_grant",
        )
        .eq("id", user.id)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("vendor_credit_balances")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    setPlan({
      tier: (prof?.subscription_tier as TierId) ?? "free",
      status: prof?.subscription_status ?? null,
      cancelAtPeriodEnd: !!prof?.subscription_cancel_at_period_end,
      currentPeriodEnd: prof?.subscription_current_period_end ?? null,
      stripeCustomerId: prof?.stripe_customer_id ?? null,
      monthlyGrant: prof?.monthly_grant ?? 0,
    });
    setBalance(bal?.balance ?? 0);
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
        } cycle. +${tier.monthlyCredits.toLocaleString()} credits are added right away.`,
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
          `$${((result.charged_now_cents ?? 0) / 100).toFixed(2)} charged today, +${(
            result.granted_now ?? 0
          ).toLocaleString()} credits added.`,
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
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pb-32 pt-6">
        <Text className="text-4xl font-bold text-foreground">Subscription</Text>
        <Text className="mt-2 mb-6 text-base text-muted-foreground">
          Plans, credits and billing
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

          <View style={{ flexDirection: "row", marginTop: 16, gap: 24 }}>
            <View>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>
                Credits
              </Text>
              <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: "700", marginTop: 2 }}>
                {balance.toLocaleString()}
              </Text>
            </View>
            {(plan?.monthlyGrant ?? 0) > 0 ? (
              <View>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>
                  Monthly grant
                </Text>
                <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: "700", marginTop: 2 }}>
                  {(plan?.monthlyGrant ?? 0).toLocaleString()}
                </Text>
              </View>
            ) : null}
          </View>

          {hasBilling ? (
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

        {/* Plan picker */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 12 }}>
          <Text style={{ color: INK, fontSize: 22, fontFamily: SERIF }}>
            Choose a plan
          </Text>
          {hasYearly ? (
            <View
              style={{
                flexDirection: "row",
                backgroundColor: SURFACE,
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
          const monthlyShown =
            tier.billingInterval === "year"
              ? tier.priceMonthly / 12
              : tier.priceMonthly;
          return (
            <View
              key={`${tier.id}_${tier.billingInterval}`}
              style={{
                backgroundColor: isCurrent ? "#eef0f3" : SURFACE,
                borderRadius: 20,
                padding: 18,
                marginBottom: 12,
                borderWidth: isCurrent ? 1.5 : 0,
                borderColor: INK,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: INK, fontSize: 17, fontWeight: "700" }}>
                  {tier.name}
                </Text>
                {isCurrent ? (
                  <Text style={{ color: INK, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>
                    Current
                  </Text>
                ) : null}
              </View>
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
              <Text style={{ color: INK_DIM, fontSize: 12, marginTop: 2 }}>
                {tier.monthlyCredits > 0
                  ? `${tier.monthlyCredits.toLocaleString()} credits/mo · ${tier.listings}`
                  : tier.listings}
              </Text>

              <View style={{ marginTop: 12, gap: 6 }}>
                {tier.highlights.map((h) => (
                  <View key={h} style={{ flexDirection: "row", alignItems: "flex-start" }}>
                    <Feather name="check" size={13} color={INK} style={{ marginTop: 2 }} />
                    <Text style={{ color: INK, fontSize: 13, marginLeft: 7, flex: 1 }}>
                      {h}
                    </Text>
                  </View>
                ))}
              </View>

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
            </View>
          );
        })}

        {/* Top-up packs */}
        {topups.length > 0 ? (
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
                    backgroundColor: SURFACE,
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

        <Text style={{ color: INK_DIM, fontSize: 11, marginTop: 12, paddingHorizontal: 4 }}>
          Billing is handled securely by Stripe on eventvendora.com. You'll
          get an email receipt for each charge.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
