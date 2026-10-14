// Public listing detail screen — Airbnb-style read-only view of a
// vendor's marketplace listing. Reached from Home → Listings card
// tap. Mirrors the web /vendors/<id-or-slug> page with the bits
// hosts actually look at (photos, headline, bio, price, packages,
// FAQs, policies, team). Inquiries / appointments are still web-
// only for now.
//
// Layout: full-bleed photo gallery at the top with circular
// back / share / heart overlays, page indicator pill (1 / N) at the
// bottom-right of the image. The white content card has rounded top
// corners that sit over the bottom of the gallery. Sticky bottom
// action bar with "From $X" and an Inquire CTA.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Rect,
  Stop,
  Path,
} from "react-native-svg";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { InquiryComposer } from "@/components/InquiryComposer";
import RAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import {
  getCategorySchema,
  PRICING_MODEL_LABELS,
  type AttributeField,
  type CategorySection,
} from "@vendora/core";
import { useT } from "@/lib/i18n";
import { C, IS_DARK } from "@/lib/theme";
import { useCategoryNames } from "@/lib/categoryNames";

// Editorial type + tone palette — bold serif title, muted ink for
// supporting copy. Matches the listing-detail design (cream cards on
// white, with deep ink #14161a as the foreground anchor).
const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";
const INK = C.text;
const INK_DIM = C.textDim;
const GOLD = C.gold;
const BRONZE = C.accentText;
const CREAM = C.page;
// Round buttons over the gallery photo stay white with ink / bronze
// icons in both themes.
const PHOTO_INK = "#14161a";
const PHOTO_BRONZE = "#8a6f3e";
// The flip-card business card: a white-to-surface wash in light, the dark
// card-to-surface wash in dark; its stat strip and flip button are glassy.
const WASH_TOP = IS_DARK ? C.card : "#ffffff";
const WASH_BOTTOM = C.surface;
const GLASS = IS_DARK ? "rgba(255,255,255,0.04)" : "rgba(255, 251, 242, 0.65)";
const GLASS_BUTTON = IS_DARK ? C.field : "rgba(255, 251, 242, 0.85)";
// The verified badge's ring matches the card under it.
const BADGE_RING = IS_DARK ? C.card : "#ffffff";

const sectionHeaderStyle = {
  paddingHorizontal: 20,
  color: INK,
  fontSize: 13,
  letterSpacing: 0.8,
} as const;

const statValueStyle = {
  color: INK,
  fontSize: 18,
  fontFamily: SERIF_BOLD,
  textAlign: "center",
} as const;

// Cards carry a 1px hairline instead of a shadow (component standard).
const CARD_BORDER = {
  borderWidth: 1,
  borderColor: C.border,
} as const;

type VendorRow = {
  id: string;
  // Set while the vendor has paused the listing: no new inquiries.
  paused_at?: string | null;
  business_name: string | null;
  category: string | null;
  bio: string | null;
  location: string | null;
  base_price_cents: number | null;
  pricing_models: string[] | null;
  price_min_cents: number | null;
  price_max_cents: number | null;
  custom_pricing: boolean | null;
  application_status: string | null;
  slug: string | null;
  verified_at: string | null;
  logo_url: string | null;
  created_at: string | null;
};

type PortfolioRow = { storage_path: string };

type PackageRow = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  includes: string[];
};

type FaqRow = {
  id: string;
  question: string;
  answer: string;
};

type TeamRow = {
  id: string;
  display_name: string;
  role: string | null;
  bio: string | null;
  is_owner: boolean;
};

type PolicyRow = {
  deposit_pct: number | null;
  cancellation_policy: string | null;
  reschedule_window_days: number | null;
  policy_notes: string | null;
};

type AttrValue = string | number | boolean | string[] | null | undefined;
type AttrMap = Record<string, AttrValue>;

type TFn = ReturnType<typeof useT>["t"];

// Stored cancellation_policy values; the label is read at render time.
const CANCELLATION_KEYS = ["flexible", "moderate", "strict"];

// Money keeps the US format in every language ($1,234).
function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

// @vendora/core's formatListingPrice / pricingModelsLabel in the app's
// language (same output in English).
function listingPriceLabel(
  t: TFn,
  minCents: number | null | undefined,
  maxCents: number | null | undefined,
): string {
  const hasMin = minCents != null && minCents > 0;
  const hasMax = maxCents != null && maxCents > 0;
  if (hasMin && hasMax) {
    return minCents === maxCents
      ? dollars(minCents as number)
      : `${dollars(minCents as number)} – ${dollars(maxCents as number)}`;
  }
  if (hasMin) return t("price.from", { price: dollars(minCents as number) });
  if (hasMax) return t("price.upTo", { price: dollars(maxCents as number) });
  return t("price.custom");
}

function pricingModelsText(t: TFn, models: string[] | null | undefined): string {
  if (!models || models.length === 0) return "";
  return models
    .map((m) => (m in PRICING_MODEL_LABELS ? t(`price.models.${m}`) : m))
    .join(" · ");
}

// Listing details (schema text) in the app's language, keyed by the
// English text; a vendor's own custom tag shows as typed.
function useAttributeNames() {
  const { tObject } = useT("listingAttributes");
  const pick = (group: string) => {
    const names = tObject<Record<string, string> | undefined>(group);
    return (text: string) =>
      names && Object.prototype.hasOwnProperty.call(names, text) ? names[text] : text;
  };
  const option = pick("options");
  const fieldOptions = tObject<Record<string, Record<string, string>> | undefined>("fieldOptions");
  return {
    section: pick("sections"),
    label: pick("labels"),
    suffix: pick("suffixes"),
    option: (text: string, field: string) => fieldOptions?.[field]?.[text] ?? option(text),
  };
}

export default function VendorDetailScreen() {
  const router = useRouter();
  const { t } = useT("vendor");
  const categoryNames = useCategoryNames();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [policy, setPolicy] = useState<PolicyRow | null>(null);
  // Per-category structured fields (vendor_profiles.category_attributes
  // jsonb). Rendered by <CategoryDetails> when the vendor's sub-category
  // has a schema in @vendora/core and at least one field has a value.
  const [categoryAttrs, setCategoryAttrs] = useState<AttrMap | null>(null);
  // Fallback avatar when vendor_profiles.logo_url is null. Pulled from
  // profiles.logo_url of the listing's user_id — the auto-sync trigger
  // only mirrors profile→listing for vendors with exactly one listing,
  // so multi-listing vendors otherwise show a blank tile here.
  const [ownerProfileLogoUrl, setOwnerProfileLogoUrl] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const [savingHeart, setSavingHeart] = useState(false);
  const [inquireOpen, setInquireOpen] = useState(false);
  // Page-sheet that opens when host taps the business card under the
  // photos. Renders a compact vendor profile snapshot.
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  // Pull-to-refresh state. refreshToken bumps re-trigger the load
  // effect; refreshing drives the RefreshControl spinner.
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        );
      const baseQuery = supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, category, bio, location, base_price_cents, pricing_models, price_min_cents, price_max_cents, custom_pricing, application_status, slug, verified_at, logo_url, created_at, deposit_pct, cancellation_policy, reschedule_window_days, policy_notes, category_attributes, paused_at",
        );
      const { data: vp } = isUuid
        ? await baseQuery.eq("id", id).maybeSingle()
        : await baseQuery.eq("slug", id).maybeSingle();
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = vp as any;
      if (!row) {
        setLoading(false);
        return;
      }
      setVendor({
        id: row.id,
        paused_at: row.paused_at ?? null,
        business_name: row.business_name,
        category: row.category,
        bio: row.bio,
        location: row.location,
        base_price_cents: row.base_price_cents,
        pricing_models: row.pricing_models,
        price_min_cents: row.price_min_cents,
        price_max_cents: row.price_max_cents,
        custom_pricing: row.custom_pricing,
        application_status: row.application_status,
        slug: row.slug,
        verified_at: row.verified_at,
        logo_url: row.logo_url,
        created_at: row.created_at,
      });
      setPolicy({
        deposit_pct: row.deposit_pct,
        cancellation_policy: row.cancellation_policy,
        reschedule_window_days: row.reschedule_window_days,
        policy_notes: row.policy_notes,
      });
      setCategoryAttrs((row.category_attributes as AttrMap | null) ?? null);

      const [imgsRes, packRes, faqRes] = await Promise.all([
        supabase
          .from("vendor_portfolio_images")
          .select("storage_path")
          .eq("vendor_id", row.id)
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("vendor_packages")
          .select("id, name, description, price_cents, includes")
          .eq("vendor_id", row.id)
          .eq("is_active", true)
          .order("display_order", { ascending: true })
          .order("price_cents", { ascending: true }),
        supabase
          .from("vendor_faqs")
          .select("id, question, answer")
          .eq("vendor_id", row.id)
          .order("display_order", { ascending: true }),
      ]);
      if (cancelled) return;

      const urls = ((imgsRes.data ?? []) as PortfolioRow[]).map(
        (r) =>
          supabase.storage.from("vendor-portfolios").getPublicUrl(r.storage_path)
            .data.publicUrl,
      );
      setPhotos(urls);
      setPackages((packRes.data ?? []) as unknown as PackageRow[]);
      setFaqs((faqRes.data ?? []) as unknown as FaqRow[]);
      // Team bios fetch removed — vendor_team_bios retired. The
      // `team` state stays initialized to [] so every consumer
      // (`team.length`, `team.find(...)`, `team[0]`) safely renders
      // nothing without needing surgery at the render sites.

      // Resolve the vendor account's identity logo as the avatar
      // fallback. We need user_id from vendor_profiles to look it up.
      const { data: ownerRow } = await supabase
        .from("vendor_profiles")
        .select("user_id")
        .eq("id", row.id)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uid = (ownerRow as any)?.user_id as string | undefined;
      if (uid) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: prof } = await (supabase as any)
          .from("profiles")
          .select("logo_url")
          .eq("id", uid)
          .maybeSingle();
        if (!cancelled) {
          setOwnerProfileLogoUrl(
            (prof as { logo_url?: string | null } | null)?.logo_url ?? null,
          );
        }
      }

      // Seed the heart from saved_vendors so the icon survives a
      // screen remount. RLS scopes the row to auth.uid() = host_id.
      if (user?.id) {
        const { data: savedRow } = await supabase
          .from("saved_vendors")
          .select("vendor_id")
          .eq("host_id", user.id)
          .eq("vendor_id", row.id)
          .maybeSingle();
        if (!cancelled) setSaved(savedRow != null);
      }

      setLoading(false);
      setRefreshing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id, refreshToken]);

  const toggleSaved = useCallback(async () => {
    if (!user?.id || !vendor?.id || savingHeart) return;
    setSavingHeart(true);
    const next = !saved;
    setSaved(next); // optimistic
    if (next) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("saved_vendors")
        .upsert(
          { host_id: user.id, vendor_id: vendor.id },
          { onConflict: "host_id,vendor_id" },
        );
      if (error) setSaved(false);
    } else {
      const { error } = await supabase
        .from("saved_vendors")
        .delete()
        .eq("host_id", user.id)
        .eq("vendor_id", vendor.id);
      if (error) setSaved(true);
    }
    setSavingHeart(false);
  }, [user?.id, vendor?.id, saved, savingHeart]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: C.page }} edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center">
          <Text style={{ fontFamily: SERIF, color: C.textDim }} className="text-sm">{t("loading")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!vendor) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: C.page }} edges={["top", "bottom"]}>
        <View className="flex-row items-center px-5 py-3">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="active:opacity-70"
          >
            <Feather name="chevron-left" size={26} color={C.text} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text style={{ fontFamily: SERIF, color: C.text }} className="text-base text-center">
            {t("notFound")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const screenWidth = Dimensions.get("window").width;
  const galleryHeight = Math.round(screenWidth * 0.95);
  const price =
    listingPriceLabel(t, vendor.price_min_cents, vendor.price_max_cents) || null;
  const pricingModels = pricingModelsText(t, vendor.pricing_models);
  const categoryLabel = vendor.category ? categoryNames.sub(vendor.category) : null;
  const owner = team.find((m) => m.is_owner) ?? team[0];

  async function shareListing() {
    if (!vendor) return;
    const url = vendor.slug
      ? `https://eventvendora.com/vendors/${vendor.slug}`
      : `https://eventvendora.com/vendors/${vendor.id}`;
    await Share.share({
      message: t("share.message", {
        name: vendor.business_name ?? t("share.fallbackName"),
        url,
      }),
      url,
    }).catch(() => {});
  }

  return (
    <View className="flex-1" style={{ backgroundColor: C.page }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={INK_DIM}
          />
        }
      >
        {/* Photo gallery — full-bleed, swipeable, with rounded bottom
            corners so the cream backdrop peeks through. */}
        <View
          style={{
            width: screenWidth,
            height: galleryHeight,
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
            overflow: "hidden",
            backgroundColor: C.surface,
          }}
        >
          {photos.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                setPhotoIndex(Math.round(x / screenWidth));
              }}
            >
              {photos.map((url, i) => (
                <Image
                  key={`${url}-${i}`}
                  source={{ uri: url }}
                  style={{ width: screenWidth, height: galleryHeight }}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          ) : vendor.logo_url || ownerProfileLogoUrl ? (
            // No portfolio photos uploaded — fall back to the vendor's
            // profile pic so the listing always opens with brand
            // identity instead of a generic gray tile.
            <Image
              source={{ uri: (vendor.logo_url ?? ownerProfileLogoUrl)! }}
              style={{ width: screenWidth, height: galleryHeight }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{ width: screenWidth, height: galleryHeight }}
              className="items-center justify-center"
            >
              <Feather name="image" size={36} color="#a89b8a" />
              <Text style={{ fontFamily: SERIF, color: C.textDim }} className="mt-2 text-sm">
                {t("noPhotos")}
              </Text>
            </View>
          )}
        </View>

        {/* Floating overlay buttons + page indicator. SafeArea-aware. */}
        <SafeAreaView
          edges={["top"]}
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          <View
            pointerEvents="box-none"
            className="flex-row items-center justify-between px-5 pt-2"
          >
            <RoundButton onPress={() => router.back()} icon="chevron-left" />
            <View className="flex-row gap-2">
              <RoundButton onPress={shareListing} icon="share" />
              <RoundButton
                onPress={toggleSaved}
                icon="heart"
                iconColor={saved ? PHOTO_BRONZE : PHOTO_INK}
                fillHeart={saved}
              />
            </View>
          </View>
        </SafeAreaView>

        {photos.length > 1 ? (
          <View
            style={{
              position: "absolute",
              top: galleryHeight - 36,
              right: 16,
            }}
          >
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: "rgba(0,0,0,0.55)",
              }}
            >
              <Text style={{ fontFamily: SERIF_BOLD }} className="text-xs text-white">
                {photoIndex + 1} / {photos.length}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Business card — sits directly under the gallery, like
            Airbnb's "Hosted by Grace · 1 year hosting" row. Tap to
            open the full vendor profile sheet. */}
        <VendorBusinessCard
          vendor={vendor}
          owner={team.find((m) => m.is_owner) ?? team[0] ?? null}
          fallbackLogoUrl={ownerProfileLogoUrl}
          onPress={() => setProfileSheetOpen(true)}
        />

        {/* Content area — sits directly on the cream backdrop. */}
        <View style={{ paddingTop: 12, paddingBottom: 8 }}>
          {/* Pill row above title — "NEW" + category — matches the
              editorial chip strip on the design. */}
          <View
            className="px-5"
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
          >
            <View
              style={{
                backgroundColor: C.selected,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 5,
              }}
            >
              <Text
                style={{ fontFamily: SERIF_BOLD,
                  color: C.onSelected,
                  fontSize: 11,
                  letterSpacing: 0.6,
                }}
              >
                {vendor.verified_at ? t("pill.verified") : t("pill.new")}
              </Text>
            </View>
            {vendor.category ? (
              <View
                style={{
                  backgroundColor: C.surface,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                }}
              >
                <Text
                  style={{ fontFamily: SERIF_BOLD,
                    color: INK,
                    fontSize: 12,
                  }}
                >
                  {categoryLabel}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Title — bold italic serif, large. */}
          <View className="px-5 pt-3">
            <Text
              style={{
                color: INK,
                fontFamily: SERIF_BOLD,
                fontSize: 38,
                lineHeight: 42,
              }}
              numberOfLines={2}
            >
              {vendor.business_name ?? t("vendorFallback")}
            </Text>

            {/* Location row with map-pin glyph */}
            {vendor.location || vendor.category ? (
              <View
                style={{
                  marginTop: 10,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Feather name="map-pin" size={14} color={INK_DIM} />
                <Text
                  style={{ fontFamily: SERIF,
                    marginLeft: 6,
                    color: INK_DIM,
                    fontSize: 14,
                    flexShrink: 1,
                  }}
                >
                  {vendor.location ?? ""}
                  {vendor.location && vendor.category ? "  ·  " : ""}
                  {categoryLabel ?? ""}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Stats row — 3 cells in a white card with vertical dividers,
              floating on the cream backdrop. */}
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 20,
              backgroundColor: C.card,
              borderRadius: 20,
              flexDirection: "row",
              ...CARD_BORDER,
            }}
          >
            <StatCell
              top={
                <Text style={statValueStyle}>
                  {vendor.verified_at ? t("stats.verified") : t("stats.justListed")}
                </Text>
              }
              bottom={vendor.verified_at ? t("stats.checked") : t("stats.new")}
            />
            <Divider />
            <StatCell
              top={<Text style={statValueStyle}>{packages.length || 0}</Text>}
              bottom={t("stats.packages", { count: packages.length })}
            />
            <Divider />
            <StatCell
              top={<Text style={statValueStyle}>{faqs.length}</Text>}
              bottom={t("stats.faqs", { count: faqs.length })}
            />
          </View>

          {/* Host section — own header + card with chevron */}
          {owner ? (
            <View style={{ marginTop: 24 }}>
              <Text style={sectionHeaderStyle}>{t("sections.host")}</Text>
              <View
                style={{
                  marginHorizontal: 20,
                  marginTop: 10,
                  backgroundColor: C.card,
                  borderRadius: 20,
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  ...CARD_BORDER,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    backgroundColor: C.selected,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: C.onSelected,
                      fontFamily: SERIF_BOLD,
                      fontSize: 18,
                    }}
                  >
                    {(owner.display_name?.[0] ?? "V").toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={{ fontFamily: SERIF_BOLD,
                      color: C.text,
                      fontSize: 15,
                    }}
                    numberOfLines={1}
                  >
                    {t("hostedBy", { name: owner.display_name })}
                  </Text>
                  <Text
                    style={{ fontFamily: SERIF,
                      marginTop: 1,
                      color: INK_DIM,
                      fontSize: 13,
                    }}
                    numberOfLines={1}
                  >
                    @
                    {(vendor.business_name ?? owner.display_name ?? "vendor")
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "")
                      .slice(0, 18)}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* About — bio paragraph, sits directly on cream */}
          {vendor.bio ? (
            <View style={{ marginTop: 24 }}>
              <Text style={sectionHeaderStyle}>{t("sections.about")}</Text>
              <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
                <Text style={{ fontFamily: SERIF, color: INK, fontSize: 15, lineHeight: 22 }}>
                  {vendor.bio}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Per-category structured details. Mirror of the web's
              CategoryAttributesDisplay — renders nothing when the
              vendor's sub-category has no schema or no field is filled. */}
          {vendor.category && categoryAttrs ? (
            <CategoryDetails category={vendor.category} attrs={categoryAttrs} />
          ) : null}

          {/* Packages — white cards on cream backdrop */}
          {packages.length > 0 ? (
            <View style={{ marginTop: 24 }}>
              <Text style={sectionHeaderStyle}>{t("sections.packages")}</Text>
              <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
                {packages.map((p) => (
                  <View
                    key={p.id}
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 20,
                      padding: 16,
                      marginBottom: 12,
                      ...CARD_BORDER,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{ fontFamily: SERIF_BOLD,
                          flex: 1,
                          paddingRight: 12,
                          color: C.text,
                          fontSize: 17,
                        }}
                      >
                        {p.name}
                      </Text>
                      <Text
                        style={{ fontFamily: SERIF_BOLD,
                          color: C.text,
                          fontSize: 17,
                        }}
                      >
                        ${(p.price_cents / 100).toLocaleString("en-US")}
                      </Text>
                    </View>
                    {p.description ? (
                      <Text
                        style={{ fontFamily: SERIF,
                          marginTop: 4,
                          color: INK_DIM,
                          fontSize: 14,
                        }}
                      >
                        {p.description}
                      </Text>
                    ) : null}
                    {p.includes && p.includes.length > 0 ? (
                      <View style={{ marginTop: 8 }}>
                        {p.includes.map((line, idx) => (
                          <Text
                            key={idx}
                            style={{ fontFamily: SERIF,
                              color: INK_DIM,
                              fontSize: 13,
                              marginTop: 2,
                            }}
                          >
                            •  {line}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Team — white cards on cream backdrop, avatar + OWNER pill */}
          {team.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Text style={sectionHeaderStyle}>{t("sections.team")}</Text>
              <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
                {team.map((m) => (
                  <View
                    key={m.id}
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 20,
                      padding: 16,
                      marginBottom: 12,
                      ...CARD_BORDER,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 999,
                          backgroundColor: C.selected,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: C.onSelected,
                            fontFamily: SERIF_BOLD,
                            fontSize: 18,
                          }}
                        >
                          {(m.display_name?.[0] ?? "?").toUpperCase()}
                        </Text>
                      </View>
                      <View
                        style={{
                          flex: 1,
                          marginLeft: 12,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{ fontFamily: SERIF_BOLD,
                              color: C.text,
                              fontSize: 16,
                            }}
                          >
                            {m.display_name}
                          </Text>
                          {m.is_owner ? (
                            <View
                              style={{
                                marginLeft: 8,
                                backgroundColor: C.border,
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                borderRadius: 8,
                              }}
                            >
                              <Text
                                style={{ fontFamily: SERIF_BOLD,
                                  color: C.text,
                                  fontSize: 10,
                                  letterSpacing: 0.8,
                                }}
                              >
                                {t("owner")}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        {m.role ? (
                          <Text
                            style={{ fontFamily: SERIF,
                              marginTop: 1,
                              color: INK_DIM,
                              fontSize: 13,
                            }}
                            numberOfLines={1}
                          >
                            {m.role}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    {m.bio ? (
                      <>
                        <View
                          style={{
                            height: 1,
                            backgroundColor: C.border,
                            marginTop: 12,
                            marginBottom: 12,
                          }}
                        />
                        <Text
                          style={{ fontFamily: SERIF,
                            color: INK,
                            fontSize: 14,
                            lineHeight: 20,
                          }}
                        >
                          {m.bio}
                        </Text>
                      </>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* FAQ — collapsible cream cards */}
          {faqs.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Text style={sectionHeaderStyle}>{t("sections.faq")}</Text>
              <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
                {faqs.map((f) => (
                  <FaqCard key={f.id} question={f.question} answer={f.answer} />
                ))}
              </View>
            </View>
          ) : null}

          {/* Policies — cream cards */}
          {policy &&
          (policy.deposit_pct != null ||
            policy.cancellation_policy ||
            policy.reschedule_window_days != null ||
            policy.policy_notes) ? (
            <View style={{ marginTop: 12 }}>
              <Text style={sectionHeaderStyle}>{t("sections.policies")}</Text>
              <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
                {policy.cancellation_policy ? (
                  <PolicyCard
                    label={t("policies.cancellation")}
                    value={
                      CANCELLATION_KEYS.includes(policy.cancellation_policy)
                        ? t(`policies.cancellationOptions.${policy.cancellation_policy}`)
                        : policy.cancellation_policy
                    }
                  />
                ) : null}
                {policy.deposit_pct != null ? (
                  <PolicyCard label={t("policies.deposit")} value={`${policy.deposit_pct}%`} />
                ) : null}
                {policy.reschedule_window_days != null ? (
                  <PolicyCard
                    label={t("policies.reschedule")}
                    value={t("policies.days", { count: policy.reschedule_window_days })}
                  />
                ) : null}
                {policy.policy_notes ? (
                  <View
                    style={{
                      marginTop: 4,
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text
                      style={{ fontFamily: SERIF,
                        color: C.text,
                        fontSize: 14,
                        lineHeight: 20,
                      }}
                    >
                      {policy.policy_notes}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky bottom action bar — FROM $X + black "Inquire >" pill */}
      <SafeAreaView
        edges={["bottom"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: C.card,
          borderTopWidth: 1,
          borderTopColor: C.border,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 12,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            {price ? (
              <>
                <Text
                  style={{ fontFamily: SERIF_BOLD,
                    color: INK_DIM,
                    fontSize: 11,
                    letterSpacing: 0.6,
                  }}
                >
                  {t("price.fromEyebrow")}
                </Text>
                {/* Manual underline via borderBottom — RN's
                    textDecorationLine on heavy-bold sits right at
                    the line-height box and clips into a ragged bar. */}
                <View
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 2,
                    borderBottomWidth: 1,
                    borderBottomColor: INK,
                    paddingBottom: 2,
                  }}
                >
                  <Text
                    style={{ fontFamily: SERIF_BOLD,
                      color: INK,
                      fontSize: 22,
                    }}
                  >
                    {price}
                  </Text>
                </View>
                {pricingModels ? (
                  <Text
                    style={{ fontFamily: SERIF,
                      marginTop: 4,
                      color: INK_DIM,
                      fontSize: 12,
                    }}
                    numberOfLines={1}
                  >
                    {pricingModels}
                  </Text>
                ) : null}
                {vendor.custom_pricing ? (
                  <Text
                    style={{ fontFamily: SERIF,
                      marginTop: 2,
                      color: INK_DIM,
                      fontSize: 12,
                    }}
                    numberOfLines={1}
                  >
                    {t("price.varies")}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text
                style={{ fontFamily: SERIF_BOLD,
                  color: C.text,
                  fontSize: 18,
                }}
              >
                {t("price.onRequest")}
              </Text>
            )}
          </View>
          {/* Children-as-function pattern — Hermes silently drops the
              `style={({pressed}) => …}` form, which on the previous
              build collapsed this pill to text-only (no background,
              no flexDirection). Wrap a View instead so styles always
              land. */}
          {vendor?.paused_at ? (
            <View style={{ flexShrink: 1, maxWidth: 200 }}>
              <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 14 }}>{t("paused.title")}</Text>
              <Text style={{ fontFamily: SERIF, color: INK, fontSize: 12, marginTop: 2 }}>
                {t("paused.body")}
              </Text>
            </View>
          ) : (
          <Pressable onPress={() => setInquireOpen(true)}>
            {({ pressed }) => (
              <View
                style={{
                  // Primary CTA: gold pill at 52, ink label.
                  backgroundColor: GOLD,
                  paddingHorizontal: 24,
                  height: 52,
                  borderRadius: 999,
                  flexDirection: "row",
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                }}
              >
                <Text
                  style={{ fontFamily: SERIF_BOLD,
                    color: C.onGold,
                    fontSize: 15,
                    marginRight: 6,
                  }}
                >
                  {t("inquire")}
                </Text>
                <Feather name="chevron-right" size={16} color={C.onGold} />
              </View>
            )}
          </Pressable>
          )}
        </View>
      </SafeAreaView>

      <InquiryComposer
        visible={inquireOpen}
        vendorId={vendor.id}
        vendorName={vendor.business_name}
        onClose={() => setInquireOpen(false)}
      />

      <VendorProfileSheet
        visible={profileSheetOpen}
        vendor={vendor}
        owner={team.find((m) => m.is_owner) ?? team[0] ?? null}
        fallbackLogoUrl={ownerProfileLogoUrl}
        onClose={() => setProfileSheetOpen(false)}
      />
    </View>
  );
}

function RoundButton({
  onPress,
  icon,
  iconColor,
  fillHeart,
}: {
  onPress: () => void;
  icon: keyof typeof Feather.glyphMap;
  iconColor?: string;
  fillHeart?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.92)",
        alignItems: "center",
        justifyContent: "center",
      }}
      className="active:opacity-80"
    >
      <Feather
        name={icon}
        size={18}
        color={iconColor ?? PHOTO_INK}
        // expo's Feather doesn't support fill; render filled heart by
        // overlaying a colored circle inside on save.
      />
      {fillHeart ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: 10,
            height: 10,
            borderRadius: 999,
            backgroundColor: iconColor ?? PHOTO_BRONZE,
          }}
        />
      ) : null}
    </Pressable>
  );
}

function StatCell({
  top,
  bottom,
}: {
  top: React.ReactNode;
  bottom: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 8, paddingVertical: 16 }}>
      {top}
      <Text
        style={{ fontFamily: SERIF_BOLD,
          marginTop: 4,
          color: INK_DIM,
          fontSize: 10,
          letterSpacing: 0.8,
          textAlign: "center",
        }}
      >
        {bottom}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={{ width: 1, backgroundColor: C.border, marginVertical: 12 }} />;
}

// Collapsible FAQ card — white surface on cream backdrop, question +
// chevron header. Tap toggles the answer; chevron flips down↔up.
function FaqCard({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      style={{
        backgroundColor: C.card,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 16,
        marginBottom: 12,
        ...CARD_BORDER,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{ fontFamily: SERIF_BOLD,
            flex: 1,
            paddingRight: 12,
            color: INK,
            fontSize: 15,
          }}
        >
          {question}
        </Text>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={INK}
        />
      </View>
      {open ? (
        <Text
          style={{ fontFamily: SERIF,
            marginTop: 10,
            color: INK_DIM,
            fontSize: 14,
            lineHeight: 20,
          }}
        >
          {answer}
        </Text>
      ) : null}
    </Pressable>
  );
}

// Policy card — white card with label on the left and value on the
// right (horizontal layout matches the editorial reference).
function PolicyCard({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 16,
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        ...CARD_BORDER,
      }}
    >
      <Text
        style={{ fontFamily: SERIF_BOLD,
          color: INK,
          fontSize: 15,
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
      <Text
        style={{ fontFamily: SERIF,
          flex: 1,
          marginLeft: 12,
          textAlign: "right",
          color: INK_DIM,
          fontSize: 14,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

// Per-category structured details. Each section in the schema becomes
// a subhead with a white card of label/value rows underneath. Sections
// with no populated field are skipped entirely so the page doesn't
// show empty rails for vendors who haven't filled the form yet.
function CategoryDetails({
  category,
  attrs,
}: {
  category: string;
  attrs: AttrMap;
}) {
  const { t } = useT("vendor");
  const schema = getCategorySchema(category);
  if (!schema) return null;

  const populatedSections = schema.sections
    .filter((s) => !s.onlySubs || s.onlySubs.includes(category))
    .filter((s) => s.fields.some((f) => hasAttrValue(attrs[f.key])));

  if (populatedSections.length === 0) return null;

  return (
    <View style={{ marginTop: 24 }}>
      <Text style={sectionHeaderStyle}>{t("sections.details")}</Text>
      <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
        {populatedSections.map((section) => (
          <CategoryDetailSection
            key={section.name}
            section={section}
            attrs={attrs}
          />
        ))}
      </View>
    </View>
  );
}

function CategoryDetailSection({
  section,
  attrs,
}: {
  section: CategorySection;
  attrs: AttrMap;
}) {
  const names = useAttributeNames();
  const populated = section.fields.filter((f) => hasAttrValue(attrs[f.key]));
  if (populated.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{ fontFamily: SERIF_BOLD,
          color: INK_DIM,
          fontSize: 11,
          letterSpacing: 1.2,
          marginBottom: 8,
        }}
      >
        {names.section(section.name).toUpperCase()}
      </Text>
      <View
        style={{
          backgroundColor: C.card,
          borderRadius: 20,
          paddingHorizontal: 16,
          paddingVertical: 4,
          ...CARD_BORDER,
        }}
      >
        {populated.map((field, idx) => (
          <CategoryDetailRow
            key={field.key}
            field={field}
            value={attrs[field.key]}
            divider={idx < populated.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

function CategoryDetailRow({
  field,
  value,
  divider,
}: {
  field: AttributeField;
  value: AttrValue;
  divider: boolean;
}) {
  return (
    <View
      style={{
        paddingVertical: 12,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: C.border,
      }}
    >
      <CategoryDetailValue field={field} value={value} />
    </View>
  );
}

function CategoryDetailValue({
  field,
  value,
}: {
  field: AttributeField;
  value: AttrValue;
}) {
  const names = useAttributeNames();
  const { locale } = useT();
  const label = names.label(field.label);
  if (field.type === "currency" && typeof value === "number") {
    return (
      <RowLabelValue
        label={label}
        value={`$${(value / 100).toLocaleString("en-US")}`}
      />
    );
  }
  if (field.type === "int" && typeof value === "number") {
    return (
      <RowLabelValue
        label={label}
        value={`${value.toLocaleString(locale)}${field.suffix ? ` ${names.suffix(field.suffix)}` : ""}`}
      />
    );
  }
  if (field.type === "boolean" && value === true) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Feather name="check" size={16} color={C.text} />
        <Text
          style={{ fontFamily: SERIF_BOLD,
            marginLeft: 8,
            color: INK,
            fontSize: 15,
          }}
        >
          {label}
        </Text>
      </View>
    );
  }
  if (field.type === "select" && typeof value === "string" && value) {
    return <RowLabelValue label={label} value={names.option(value, field.key)} />;
  }
  if (field.type === "tags") {
    const tags = (value as string[] | undefined) ?? [];
    if (tags.length === 0) return null;
    return (
      <View>
        <Text
          style={{ fontFamily: SERIF,
            color: INK_DIM,
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          {label}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {tags.map((t) => (
            <View
              key={t}
              style={{
                backgroundColor: C.surface,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 12,}}>
                {names.option(t, field.key)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }
  return null;
}

function RowLabelValue({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontFamily: SERIF, flex: 1, color: INK_DIM, fontSize: 14, paddingRight: 12 }}>
        {label}
      </Text>
      <Text
        style={{ fontFamily: SERIF_BOLD,
          color: INK,
          fontSize: 15,
          textAlign: "right",
          flexShrink: 1,
        }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function hasAttrValue(v: AttrValue): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return false;
}

// "Listing since Mar 2026" style label — short month + year is enough,
// matches Airbnb's "1 year hosting" terseness.
function joinedLabel(t: TFn, iso: string | null | undefined): string {
  if (!iso) return t("joined.recently");
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return t("joined.recently");
  const now = new Date();
  const months =
    (now.getFullYear() - then.getFullYear()) * 12 +
    (now.getMonth() - then.getMonth());
  if (months < 1) return t("joined.justJoined");
  if (months < 12) return t("joined.months", { count: months });
  const years = Math.floor(months / 12);
  return t("joined.years", { count: years });
}

function VendorBusinessCard({
  vendor,
  owner,
  fallbackLogoUrl,
  onPress,
}: {
  vendor: VendorRow;
  owner: TeamRow | null;
  fallbackLogoUrl: string | null;
  onPress: () => void;
}) {
  const { t } = useT("vendor");
  const initial = (
    vendor.business_name?.[0] ??
    owner?.display_name?.[0] ??
    "V"
  ).toUpperCase();
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 16,
          backgroundColor: C.card,
          borderRadius: 20,
          paddingVertical: 16,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          ...CARD_BORDER,
        }}
      >
        <CreamOceanAvatar
          size={48}
          logoUrl={vendor.logo_url ?? fallbackLogoUrl}
          initial={initial}
          fontSize={22}
          radius={12}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text
            style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 15,}}
            numberOfLines={1}
          >
            {t("hostedBy", {
              name: owner?.display_name ?? vendor.business_name ?? t("vendorFallback"),
            })}
          </Text>
          <Text
            style={{ fontFamily: SERIF, marginTop: 2, color: INK_DIM, fontSize: 13 }}
            numberOfLines={1}
          >
            {joinedLabel(t, vendor.created_at)}
          </Text>
        </View>
        <Feather name="chevron-right" size={20} color={INK_DIM} />
      </View>
    </Pressable>
  );
}

// Reused on the small business card and the big profile-sheet card —
// dark base + warm radial overlays (red + gold) + italic-serif letter
// when no logo is uploaded; renders the logo image otherwise.
function CreamOceanAvatar({
  size,
  logoUrl,
  initial,
  fontSize,
  radius,
}: {
  size: number;
  logoUrl: string | null;
  initial: string;
  fontSize: number;
  radius: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: "hidden",
        backgroundColor: "#14161a",
      }}
    >
      {/* Always paint the gradient + initial first. When a logo URL is
          provided, the Image renders on top — but until it loads the
          user already sees the styled tile instead of a black square. */}
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={`avA-${size}`} cx="0.3" cy="0.3" rx="0.6" ry="0.6">
            <Stop offset="0" stopColor="#b8472f" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#b8472f" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`avB-${size}`} cx="0.7" cy="0.75" rx="0.6" ry="0.6">
            <Stop offset="0" stopColor="#b89556" stopOpacity="0.3" />
            <Stop offset="1" stopColor="#b89556" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#avA-${size})`} />
        <Rect x={0} y={0} width={size} height={size} fill={`url(#avB-${size})`} />
      </Svg>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: "#ffffff",
            fontFamily: SERIF_BOLD,
            fontSize,
            lineHeight: fontSize * 1.05,
            letterSpacing: -1,
          }}
        >
          {initial}
        </Text>
      </View>
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

interface SheetPostRow {
  id: string;
  image_url: string;
  caption: string | null;
}
interface SheetReelRow {
  id: string;
  thumbnail_url: string | null;
  video_url: string;
}
interface SheetBuzzRow {
  id: string;
  body: string;
  created_at: string;
}
interface SheetListingRow {
  id: string;
  business_name: string | null;
  category: string | null;
  logo_url: string | null;
}

type SheetTab = "posts" | "reels" | "buzz" | "listings";

function VendorProfileSheet({
  visible,
  vendor,
  owner,
  fallbackLogoUrl,
  onClose,
}: {
  visible: boolean;
  vendor: VendorRow;
  owner: TeamRow | null;
  fallbackLogoUrl: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { t } = useT("vendor");
  const { t: tc } = useT("common");
  const [tab, setTab] = useState<SheetTab>("posts");
  const [posts, setPosts] = useState<SheetPostRow[]>([]);
  const [reels, setReels] = useState<SheetReelRow[]>([]);
  const [buzz, setBuzz] = useState<SheetBuzzRow[]>([]);
  const [otherListings, setOtherListings] = useState<SheetListingRow[]>([]);

  useEffect(() => {
    if (!visible || !vendor.id) return;
    let cancelled = false;
    (async () => {
      const [postsRes, reelsRes, buzzRes, ownerVendorRes] = await Promise.all([
        supabase
          .from("vendor_posts")
          .select("id, image_url, caption")
          .eq("vendor_id", vendor.id)
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("vendor_reels")
          .select("id, thumbnail_url, video_url")
          .eq("vendor_id", vendor.id)
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("vendor_buzz")
          .select("id, body, created_at")
          .eq("vendor_id", vendor.id)
          .order("created_at", { ascending: false })
          .limit(40),
        // Other listings owned by the same vendor account, resolved via
        // the row's user_id. Excludes this listing itself.
        supabase
          .from("vendor_profiles")
          .select("user_id")
          .eq("id", vendor.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setPosts((postsRes.data ?? []) as SheetPostRow[]);
      setReels((reelsRes.data ?? []) as SheetReelRow[]);
      setBuzz((buzzRes.data ?? []) as SheetBuzzRow[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uid = (ownerVendorRes.data as any)?.user_id as string | undefined;
      if (uid) {
        // Pull every approved listing this vendor account owns,
        // including the one the host is currently viewing — the user
        // wants to see the full set in the sheet, with the current
        // one marked.
        const { data: more } = await supabase
          .from("vendor_profiles")
          .select("id, business_name, category, logo_url")
          .eq("user_id", uid)
          .eq("application_status", "approved")
          .is("paused_at", null)
          .order("created_at", { ascending: false });
        if (!cancelled) {
          setOtherListings(((more ?? []) as SheetListingRow[]) ?? []);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, vendor.id]);

  const counts = {
    posts: posts.length,
    reels: reels.length,
    buzz: buzz.length,
    listings: otherListings.length,
  };
  const initial = (
    vendor.business_name?.[0] ??
    owner?.display_name?.[0] ??
    "V"
  ).toUpperCase();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={{ flex: 1, backgroundColor: CREAM }}
        edges={["top"]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 12,
          }}
        >
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ fontFamily: SERIF, fontSize: 16, color: INK_DIM }}>{tc("actions.close")}</Text>
          </Pressable>
          <Text
            style={{ fontSize: 17, color: INK, fontFamily: SERIF_BOLD, flexShrink: 1, textAlign: "center" }}
            numberOfLines={1}
          >
            {t("sheet.title")}
          </Text>
          <View style={{ width: 56 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Cream Ocean business card — gradient cream-to-warm canvas
              with avatar tile, italic-serif name, location, and a
              translucent stat strip. */}
          <CreamOceanCard
            vendor={vendor}
            initial={initial}
            fallbackLogoUrl={fallbackLogoUrl}
          />

          {/* Bio lives on the back of the Cream Ocean card above —
              tap the rotate button on the card to flip it over. */}

          {/* Owner bio (was sourced from vendor_team_bios; table dropped, render guarded by empty `team` state). */}
          {owner?.bio ? (
            <View style={{ marginTop: 24, paddingHorizontal: 20 }}>
              <Text
                style={{ fontFamily: SERIF_BOLD,
                  fontSize: 11,
                  letterSpacing: 1.6,
                  color: INK_DIM,
                }}
              >
                {t("sheet.aboutName", { name: owner.display_name?.toUpperCase() })}
              </Text>
              <Text
                style={{
                  marginTop: 10,
                  color: INK,
                  fontSize: 15,
                  lineHeight: 22,
                  fontFamily: SERIF_ITALIC,
                }}
              >
                {owner.bio}
              </Text>
            </View>
          ) : null}

          {/* Feed tabs — mirrors the vendor's own profile (Posts /
              Reels / Buzz / Listings) read-only. No edit buttons,
              no Create CTAs. */}
          <View style={{ marginTop: 32 }}>
            <View
              style={{
                flexDirection: "row",
                paddingHorizontal: 20,
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <SheetTabPill
                active={tab === "posts"}
                label={t("sheet.tabs.posts")}
                count={counts.posts}
                onPress={() => setTab("posts")}
              />
              <SheetTabPill
                active={tab === "reels"}
                label={t("sheet.tabs.reels")}
                count={counts.reels}
                onPress={() => setTab("reels")}
              />
              <SheetTabPill
                active={tab === "buzz"}
                label={t("sheet.tabs.buzz")}
                count={counts.buzz}
                onPress={() => setTab("buzz")}
              />
              <SheetTabPill
                active={tab === "listings"}
                label={t("sheet.tabs.listings")}
                count={counts.listings}
                onPress={() => setTab("listings")}
              />
            </View>

            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              {tab === "posts" ? (
                posts.length === 0 ? (
                  <SheetEmpty body={t("sheet.empty.posts")} />
                ) : (
                  <SheetPostGrid posts={posts} />
                )
              ) : tab === "reels" ? (
                reels.length === 0 ? (
                  <SheetEmpty body={t("sheet.empty.reels")} />
                ) : (
                  <SheetReelGrid reels={reels} />
                )
              ) : tab === "buzz" ? (
                buzz.length === 0 ? (
                  <SheetEmpty body={t("sheet.empty.buzz")} />
                ) : (
                  <SheetBuzzList items={buzz} />
                )
              ) : otherListings.length === 0 ? (
                <SheetEmpty body={t("sheet.empty.listings")} />
              ) : (
                <SheetListingsList
                  listings={otherListings}
                  currentId={vendor.id}
                  onPress={(id) => {
                    if (id === vendor.id) {
                      // Already on this listing — just dismiss the sheet.
                      onClose();
                      return;
                    }
                    onClose();
                    // Allow the modal close animation to finish before
                    // navigating so the new route doesn't render
                    // underneath the dismissing sheet.
                    setTimeout(() => {
                      router.push(`/(host)/vendor/${id}` as never);
                    }, 220);
                  }}
                />
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function SheetTabPill({
  active,
  label,
  count,
  onPress,
}: {
  active: boolean;
  label: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: active ? C.selected : C.field,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text
          style={{ fontFamily: SERIF_BOLD,
            color: active ? C.onSelected : INK,
            fontSize: 13,
          }}
        >
          {label}
        </Text>
        <Text
          style={{ fontFamily: SERIF_BOLD,
            color: active ? C.onSelected : INK_DIM,
            fontSize: 13,
          }}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function SheetEmpty({ body }: { body: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 32 }}>
      <Text
        style={{
          fontFamily: SERIF_ITALIC,
          color: INK_DIM,
          fontSize: 15,
        }}
      >
        {body}
      </Text>
    </View>
  );
}

function SheetPostGrid({ posts }: { posts: SheetPostRow[] }) {
  return (
    <FlatList
      data={posts}
      keyExtractor={(p) => p.id}
      numColumns={3}
      scrollEnabled={false}
      renderItem={({ item }) => (
        <View style={{ flex: 1 / 3, aspectRatio: 1, padding: 4 }}>
          <View
            style={{
              flex: 1,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: C.surface,
            }}
          >
            <Image
              source={{ uri: item.image_url }}
              style={{ flex: 1 }}
              resizeMode="cover"
            />
          </View>
        </View>
      )}
    />
  );
}

function SheetReelGrid({ reels }: { reels: SheetReelRow[] }) {
  return (
    <FlatList
      data={reels}
      keyExtractor={(r) => r.id}
      numColumns={3}
      scrollEnabled={false}
      renderItem={({ item }) => (
        <View style={{ flex: 1 / 3, aspectRatio: 9 / 16, padding: 4 }}>
          <View
            style={{
              flex: 1,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: "#14161a",
            }}
          >
            {item.thumbnail_url ? (
              <Image
                source={{ uri: item.thumbnail_url }}
                style={{ flex: 1 }}
                resizeMode="cover"
              />
            ) : null}
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="play" size={14} color="#ffffff" />
              </View>
            </View>
          </View>
        </View>
      )}
    />
  );
}

function SheetBuzzList({ items }: { items: SheetBuzzRow[] }) {
  const { locale } = useT();
  return (
    <View style={{ gap: 12, paddingTop: 4 }}>
      {items.map((b) => (
        <View
          key={b.id}
          style={{
            backgroundColor: C.card,
            borderRadius: 20,
            padding: 16,
            marginHorizontal: 4,
            ...CARD_BORDER,
          }}
        >
          <Text
            style={{
              color: INK,
              fontSize: 15,
              lineHeight: 21,
              fontFamily: SERIF,
            }}
          >
            {b.body}
          </Text>
          <Text style={{ fontFamily: SERIF, marginTop: 6, color: INK_DIM, fontSize: 12 }}>
            {new Date(b.created_at).toLocaleDateString(locale)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SheetListingsList({
  listings,
  currentId,
  onPress,
}: {
  listings: SheetListingRow[];
  currentId: string;
  onPress: (id: string) => void;
}) {
  const { t } = useT("vendor");
  const categoryNames = useCategoryNames();
  return (
    <View style={{ gap: 12, paddingTop: 4 }}>
      {listings.map((l) => {
        const isCurrent = l.id === currentId;
        return (
          <Pressable key={l.id} onPress={() => onPress(l.id)}>
            <View
              style={{
                backgroundColor: C.card,
                borderRadius: 20,
                padding: 16,
                marginHorizontal: 4,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                // Card hairline; the listing being viewed is selected (ink).
                borderWidth: 1,
                borderColor: isCurrent ? C.selected : C.border,
              }}
            >
              {l.logo_url ? (
                <Image
                  source={{ uri: l.logo_url }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: CREAM,
                  }}
                />
              ) : (
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: C.selected,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: C.onSelected,
                      fontFamily: SERIF_BOLD,
                      fontSize: 18,
                    }}
                  >
                    {(l.business_name?.[0] ?? "V").toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Text
                    style={{ fontFamily: SERIF_BOLD, color: INK, fontSize: 15, flexShrink: 1 }}
                    numberOfLines={1}
                  >
                    {l.business_name ?? t("listingFallback")}
                  </Text>
                  {isCurrent ? (
                    <View
                      style={{
                        backgroundColor: C.selected,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 999,
                      }}
                    >
                      <Text
                        style={{ fontFamily: SERIF_BOLD,
                          color: C.onSelected,
                          fontSize: 9,
                          letterSpacing: 0.6,
                        }}
                      >
                        {t("sheet.viewing")}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {l.category ? (
                  <Text
                    style={{ fontFamily: SERIF, marginTop: 2, color: INK_DIM, fontSize: 13 }}
                    numberOfLines={1}
                  >
                    {categoryNames.sub(l.category)}
                  </Text>
                ) : null}
              </View>
              {isCurrent ? null : (
                <Feather name="chevron-right" size={20} color={INK_DIM} />
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProfileSheetStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 16, alignItems: "center" }}>
      <Text
        style={{ fontFamily: SERIF_BOLD,
          fontSize: 10,
          letterSpacing: 1.4,
          color: INK_DIM,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontFamily: SERIF,
          fontSize: 15,
          color: INK,
          textAlign: "center",
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Cream Ocean card ─────────────────────────────────────────────────
// Editorial business card matching the cream-ocean web mock. Uses
// react-native-svg for the gradient backdrop + decorative ripple
// stripes (no native deps required, ships via OTA). Animated ripples
// / foam / shimmer are intentionally deferred — they need expo-blur
// or reanimated-svg work that requires a native rebuild.
function CreamOceanCard({
  vendor,
  initial,
  fallbackLogoUrl,
}: {
  vendor: VendorRow;
  initial: string;
  fallbackLogoUrl: string | null;
}) {
  const CARD_W = Dimensions.get("window").width - 40;
  const CARD_H = 230;

  // Flip animation that mirrors the HTML reference pattern: ONE parent
  // Animated.View rotates 0deg → 180deg, both faces sit as children
  // with the back wearing a static rotateY(180deg). Equivalent to CSS
  // transform-style: preserve-3d. Only one animation interpolation
  // instead of two — simpler, fewer surfaces for iOS hit-testing to
  // misbehave through.
  // Reanimated flip — runs on the UI thread so it's smooth even
  // under JS-thread load. UI-thread rotateY interpolation is way
  // more reliable than RN's built-in Animated for iOS 3D transforms.
  const flipProgress = useSharedValue(0);
  const [flipped, setFlipped] = useState(false);
  const flippedRef = useRef(false);
  const isAnimatingRef = useRef(false);
  const toggleFlip = () => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    const next = !flippedRef.current;
    flippedRef.current = next;
    setFlipped(next);
    flipProgress.value = withTiming(next ? 1 : 0, {
      duration: 600,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    setTimeout(() => {
      isAnimatingRef.current = false;
    }, 620);
  };

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1600 },
      { rotateY: `${flipProgress.value * 180}deg` },
    ],
  }));
  const frontAnimatedStyle = useAnimatedStyle(() => ({
    opacity: flipProgress.value < 0.5 ? 1 : 0,
  }));
  const backAnimatedStyle = useAnimatedStyle(() => ({
    opacity: flipProgress.value < 0.5 ? 0 : 1,
  }));

  return (
    <Pressable
      onPress={toggleFlip}
      style={{
        marginHorizontal: 20,
        marginTop: 12,
        height: CARD_H,
      }}
    >
      <RAnimated.View
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          },
          cardAnimatedStyle,
        ]}
      >
        {/* Front face. Opacity-gated via Reanimated worklet — hard cut
            at the halfway point of rotation since iOS backfaceVisibility
            on RN is unreliable. */}
        <RAnimated.View
          pointerEvents={flipped ? "none" : "auto"}
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 20,
              backgroundColor: C.card,
              borderWidth: 1,
              borderColor: C.border,
              overflow: "hidden",
            },
            frontAnimatedStyle,
          ]}
        >
          <CreamOceanFront
            vendor={vendor}
            initial={initial}
            fallbackLogoUrl={fallbackLogoUrl}
            width={CARD_W}
            height={CARD_H}
            onFlip={toggleFlip}
          />
        </RAnimated.View>

        {/* Back face — static rotateY(180deg) so its content is upright
            once the parent reaches 180deg. */}
        <RAnimated.View
          pointerEvents={flipped ? "auto" : "none"}
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 20,
              backgroundColor: C.card,
              borderWidth: 1,
              borderColor: C.border,
              overflow: "hidden",
              transform: [{ rotateY: "180deg" }],
            },
            backAnimatedStyle,
          ]}
        >
          <CreamOceanBack
            vendor={vendor}
            width={CARD_W}
            height={CARD_H}
            onFlip={toggleFlip}
          />
        </RAnimated.View>
      </RAnimated.View>
    </Pressable>
  );
}

// Front face — gradient backdrop + sun glow + ripples + swell + avatar
// tile + name + location + stat strip. The flip button sits top-right.
function CreamOceanFront({
  vendor,
  initial,
  fallbackLogoUrl,
  width,
  height,
  onFlip,
}: {
  vendor: VendorRow;
  initial: string;
  fallbackLogoUrl: string | null;
  width: number;
  height: number;
  onFlip: () => void;
}) {
  const { t, locale } = useT("vendor");
  return (
    <>
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Defs>
          <SvgLinearGradient id="bgF" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={WASH_TOP} />
            <Stop offset="1" stopColor={WASH_BOTTOM} />
          </SvgLinearGradient>
          <RadialGradient id="sunF" cx="0.18" cy="0.18" rx="0.55" ry="0.55">
            <Stop offset="0" stopColor="#ffe6b4" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#ffe6b4" stopOpacity="0" />
          </RadialGradient>
          <SvgLinearGradient id="rippleF" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#a8893f" stopOpacity="0" />
            <Stop offset="0.5" stopColor="#fff0c8" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#a8893f" stopOpacity="0" />
          </SvgLinearGradient>
          <SvgLinearGradient id="swellF" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor="#d9c599" stopOpacity="0.55" />
            <Stop offset="0.5" stopColor="#ecdfc1" stopOpacity="0.3" />
            <Stop offset="1" stopColor="#ecdfc1" stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#bgF)" />
        <Rect x={0} y={0} width={width} height={height} fill="url(#sunF)" />
        <Rect x={0} y={height * 0.32} width={width} height={1.5} fill="url(#rippleF)" />
        <Rect x={0} y={height * 0.48} width={width} height={1.5} fill="url(#rippleF)" opacity={0.7} />
        <Rect x={0} y={height * 0.62} width={width} height={1.5} fill="url(#rippleF)" opacity={0.55} />
        <Rect x={0} y={height * 0.76} width={width} height={1.5} fill="url(#rippleF)" opacity={0.4} />
        <Path
          d={`M -20 ${height} Q ${width / 2} ${height * 0.55} ${width + 20} ${height} Z`}
          fill="url(#swellF)"
        />
      </Svg>

      <View style={{ padding: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 20,
            marginBottom: 20,
          }}
        >
          <View>
            <CreamOceanAvatar
              size={110}
              logoUrl={vendor.logo_url ?? fallbackLogoUrl}
              initial={initial}
              fontSize={72}
              radius={20}
            />
            {vendor.verified_at ? (
              <View
                style={{
                  position: "absolute",
                  bottom: -4,
                  right: -4,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: BRONZE,
                  borderWidth: 3,
                  borderColor: BADGE_RING,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="check" size={11} color={IS_DARK ? C.onGold : "#ffffff"} />
              </View>
            ) : null}
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: SERIF_BOLD,
                fontSize: 32,
                lineHeight: 34,
                letterSpacing: -0.6,
                color: INK,
                marginBottom: 6,
                paddingRight: 28,
              }}
              numberOfLines={2}
            >
              {vendor.business_name ?? t("vendorFallback")}
            </Text>
            {vendor.location ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Feather name="map-pin" size={12} color="#9c8f80" />
                <Text
                  style={{ fontFamily: SERIF,
                    fontSize: 13,
                    color: INK,
                  }}
                  numberOfLines={1}
                >
                  {vendor.location}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            backgroundColor: GLASS,
            borderWidth: 1,
            borderColor: C.border,
            borderRadius: 12,
            paddingVertical: 12,
          }}
        >
          <CreamOceanStat label={t("sheet.stats.bookings")} value="0" />
          <View
            style={{ width: 1, backgroundColor: C.border }}
          />
          <CreamOceanStat label={t("sheet.stats.rating")} value="—" italic />
          <View
            style={{ width: 1, backgroundColor: C.border }}
          />
          <CreamOceanStat
            label={t("sheet.stats.joined")}
            value={shortJoined(t, locale, vendor.created_at)}
            italic
          />
        </View>
      </View>

      {/* Flip button — rendered LAST so its absolute layer sits on top
          of the padded content for touch event capture (transparent
          content View was eating the tap when rendered after). */}
      <Pressable
        onPress={onFlip}
        hitSlop={8}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: GLASS_BUTTON,
          borderWidth: 1,
          borderColor: C.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name="rotate-cw" size={18} color={INK} />
      </Pressable>
    </>
  );
}

// Back face — a "studio note" letterpress-style page. Italic-serif
// bio paragraph, category line, and verified status. Same gradient
// backdrop but no avatar / stat strip so the front and back read as
// different sides of the same physical card.
function CreamOceanBack({
  vendor,
  width,
  height,
  onFlip,
}: {
  vendor: VendorRow;
  width: number;
  height: number;
  onFlip: () => void;
}) {
  const { t } = useT("vendor");
  const hasBio = !!vendor.bio?.trim();
  return (
    <>
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Defs>
          <SvgLinearGradient id="bgB" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={WASH_TOP} />
            <Stop offset="1" stopColor={WASH_BOTTOM} />
          </SvgLinearGradient>
          <RadialGradient id="sunB" cx="0.82" cy="0.18" rx="0.55" ry="0.55">
            <Stop offset="0" stopColor="#ffe6b4" stopOpacity="0.5" />
            <Stop offset="1" stopColor="#ffe6b4" stopOpacity="0" />
          </RadialGradient>
          <SvgLinearGradient id="swellB" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor="#d9c599" stopOpacity="0.5" />
            <Stop offset="0.5" stopColor="#ecdfc1" stopOpacity="0.25" />
            <Stop offset="1" stopColor="#ecdfc1" stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#bgB)" />
        <Rect x={0} y={0} width={width} height={height} fill="url(#sunB)" />
        <Path
          d={`M -20 0 Q ${width / 2} ${height * 0.45} ${width + 20} 0 Z`}
          fill="url(#swellB)"
        />
      </Svg>

      {/* Bio on the back — mirrors the front face's plain-View pattern
          (no flex/no position:absolute) for cross-iOS rendering parity. */}
      <View style={{ padding: 16, paddingTop: 60 }}>
        <Text
          style={{
            fontFamily: SERIF_ITALIC,
            color: INK,
            fontSize: hasBio ? 18 : 16,
            lineHeight: hasBio ? 26 : 22,
            textAlign: "center",
          }}
          numberOfLines={5}
        >
          {hasBio ? vendor.bio : t("sheet.noBio")}
        </Text>
      </View>

      {/* Flip back button — rendered LAST so it stays on top of the
          padded content for touch capture. */}
      <Pressable
        onPress={onFlip}
        hitSlop={8}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: GLASS_BUTTON,
          borderWidth: 1,
          borderColor: C.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name="rotate-ccw" size={14} color={INK} />
      </Pressable>
    </>
  );
}

function CreamOceanStat({
  label,
  value,
  italic,
}: {
  label: string;
  value: string;
  italic?: boolean;
}) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 8, alignItems: "center" }}>
      <Text
        style={{ fontFamily: SERIF_BOLD,
          fontSize: 9,
          letterSpacing: 1.8,
          textTransform: "uppercase",
          color: INK_DIM,
          marginBottom: 3,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: SERIF_BOLD,
          fontSize: italic ? 14 : 16,
          color: INK,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function shortJoined(t: TFn, locale: string, iso: string | null | undefined): string {
  if (!iso) return t("sheet.stats.today");
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return t("sheet.stats.today");
  const now = new Date();
  const isSameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  if (isSameDay) return t("sheet.stats.today");
  const months =
    (now.getFullYear() - then.getFullYear()) * 12 +
    (now.getMonth() - then.getMonth());
  if (months < 12) {
    return then.toLocaleDateString(locale, {
      month: "short",
      year: "numeric",
    });
  }
  return String(then.getFullYear());
}
