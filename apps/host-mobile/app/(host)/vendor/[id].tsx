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
import {
  getCategorySchema,
  type AttributeField,
  type CategorySection,
} from "@vendora/core";

// Editorial type + tone palette — bold serif title, muted ink for
// supporting copy. Matches the listing-detail design (cream cards on
// white, with deep ink #1a1410 as the foreground anchor).
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";
const INK = "#1a1410";
const INK_DIM = "#776c5f";
const CREAM = "#f5efe5";

const sectionHeaderStyle = {
  paddingHorizontal: 20,
  color: INK,
  fontSize: 13,
  fontWeight: "800",
  letterSpacing: 0.8,
} as const;

const statValueStyle = {
  color: INK,
  fontSize: 18,
  fontWeight: "600",
  fontFamily: SERIF,
  fontStyle: "italic",
} as const;

// Shared shadow style for white cards floating on the cream backdrop.
const CARD_SHADOW = {
  shadowColor: "#1a1410",
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

type VendorRow = {
  id: string;
  business_name: string | null;
  category: string | null;
  bio: string | null;
  location: string | null;
  base_price_cents: number | null;
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

const CANCELLATION_LABEL: Record<string, string> = {
  flexible: "Flexible — full refund up to 7 days before",
  moderate: "Moderate — 50% up to 30 days before",
  strict: "Strict — non-refundable",
};

export default function VendorDetailScreen() {
  const router = useRouter();
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
          "id, business_name, category, bio, location, base_price_cents, application_status, slug, verified_at, logo_url, created_at, deposit_pct, cancellation_policy, reschedule_window_days, policy_notes, category_attributes",
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
        business_name: row.business_name,
        category: row.category,
        bio: row.bio,
        location: row.location,
        base_price_cents: row.base_price_cents,
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

      const [imgsRes, packRes, faqRes, teamRes] = await Promise.all([
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_team_bios")
          .select("id, display_name, role, bio, is_owner, display_order")
          .eq("vendor_id", row.id)
          .order("is_owner", { ascending: false })
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
      setTeam(((teamRes as { data?: TeamRow[] }).data ?? []) as TeamRow[]);

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
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

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
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-muted-foreground">Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!vendor) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="active:opacity-70"
          >
            <Feather name="chevron-left" size={26} color="#0a0a0a" />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base text-foreground text-center">
            Listing not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const screenWidth = Dimensions.get("window").width;
  const galleryHeight = Math.round(screenWidth * 0.95);
  const price =
    vendor.base_price_cents != null
      ? `$${Math.round(vendor.base_price_cents / 100).toLocaleString()}`
      : null;
  const owner = team.find((m) => m.is_owner) ?? team[0];

  async function shareListing() {
    if (!vendor) return;
    const url = vendor.slug
      ? `https://eventvendora.com/vendors/${vendor.slug}`
      : `https://eventvendora.com/vendors/${vendor.id}`;
    await Share.share({
      message: `${vendor.business_name ?? "This vendor"} on Vendora — ${url}`,
      url,
    }).catch(() => {});
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Photo gallery — full-bleed, swipeable, with rounded bottom
            corners so the cream backdrop peeks through. */}
        <View
          style={{
            width: screenWidth,
            height: galleryHeight,
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 28,
            overflow: "hidden",
          }}
          className="bg-muted"
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
              <Feather name="image" size={36} color="#a1a1aa" />
              <Text className="mt-2 text-sm text-muted-foreground">
                No listing photos yet
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
            className="flex-row items-center justify-between px-4 pt-2"
          >
            <RoundButton onPress={() => router.back()} icon="chevron-left" />
            <View className="flex-row gap-2">
              <RoundButton onPress={shareListing} icon="share" />
              <RoundButton
                onPress={toggleSaved}
                icon="heart"
                iconColor={saved ? "#dc2626" : "#0a0a0a"}
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
              <Text className="text-xs font-semibold text-white">
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
                backgroundColor: "#1a1410",
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 5,
              }}
            >
              <Text
                style={{
                  color: "#faf5ec",
                  fontSize: 11,
                  fontWeight: "800",
                  letterSpacing: 0.6,
                }}
              >
                {vendor.verified_at ? "VERIFIED" : "NEW"}
              </Text>
            </View>
            {vendor.category ? (
              <View
                style={{
                  backgroundColor: "#efe5d2",
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                }}
              >
                <Text
                  style={{
                    color: INK,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {vendor.category}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Title — bold italic serif, large. */}
          <View className="px-5 pt-3">
            <Text
              style={{
                color: INK,
                fontFamily: SERIF,
                fontSize: 38,
                fontWeight: "700",
                fontStyle: "italic",
                lineHeight: 42,
              }}
              numberOfLines={2}
            >
              {vendor.business_name ?? "Vendor"}
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
                  style={{
                    marginLeft: 6,
                    color: INK_DIM,
                    fontSize: 14,
                  }}
                >
                  {vendor.location ?? ""}
                  {vendor.location && vendor.category ? "  ·  " : ""}
                  {vendor.category ?? ""}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Stats row — 3 cells in a white card with vertical dividers,
              floating on the cream backdrop. */}
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 18,
              backgroundColor: "#ffffff",
              borderRadius: 18,
              flexDirection: "row",
              ...CARD_SHADOW,
            }}
          >
            <StatCell
              top={
                <Text style={statValueStyle}>
                  {vendor.verified_at ? "Verified" : "Just listed"}
                </Text>
              }
              bottom={vendor.verified_at ? "Vendora-checked" : "NEW"}
            />
            <Divider />
            <StatCell
              top={<Text style={statValueStyle}>{packages.length || 0}</Text>}
              bottom={packages.length === 1 ? "PACKAGE" : "PACKAGES"}
            />
            <Divider />
            <StatCell
              top={<Text style={statValueStyle}>{faqs.length}</Text>}
              bottom={faqs.length === 1 ? "FAQ" : "FAQS"}
            />
          </View>

          {/* Host section — own header + card with chevron */}
          {owner ? (
            <View style={{ marginTop: 26 }}>
              <Text style={sectionHeaderStyle}>Host</Text>
              <View
                style={{
                  marginHorizontal: 20,
                  marginTop: 10,
                  backgroundColor: "#ffffff",
                  borderRadius: 18,
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  shadowColor: "#1a1410",
                  shadowOpacity: 0.05,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 2,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    backgroundColor: "#1a1410",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#faf5ec",
                      fontFamily: SERIF,
                      fontWeight: "600",
                      fontSize: 18,
                    }}
                  >
                    {(owner.display_name?.[0] ?? "V").toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={{
                      color: "#1a1410",
                      fontSize: 15,
                      fontWeight: "700",
                    }}
                    numberOfLines={1}
                  >
                    Hosted by {owner.display_name}
                  </Text>
                  <Text
                    style={{
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
            <View style={{ marginTop: 26 }}>
              <Text style={sectionHeaderStyle}>About</Text>
              <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
                <Text style={{ color: INK, fontSize: 15, lineHeight: 22 }}>
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
              <Text style={sectionHeaderStyle}>Packages</Text>
              <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
                {packages.map((p) => (
                  <View
                    key={p.id}
                    style={{
                      backgroundColor: "#ffffff",
                      borderRadius: 18,
                      padding: 16,
                      marginBottom: 12,
                      ...CARD_SHADOW,
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
                        style={{
                          flex: 1,
                          paddingRight: 12,
                          color: "#1a1410",
                          fontSize: 17,
                          fontWeight: "700",
                        }}
                      >
                        {p.name}
                      </Text>
                      <Text
                        style={{
                          color: "#1a1410",
                          fontSize: 17,
                          fontWeight: "700",
                        }}
                      >
                        ${(p.price_cents / 100).toLocaleString()}
                      </Text>
                    </View>
                    {p.description ? (
                      <Text
                        style={{
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
                            style={{
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
            <View style={{ marginTop: 14 }}>
              <Text style={sectionHeaderStyle}>Team</Text>
              <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
                {team.map((m) => (
                  <View
                    key={m.id}
                    style={{
                      backgroundColor: "#ffffff",
                      borderRadius: 18,
                      padding: 16,
                      marginBottom: 12,
                      ...CARD_SHADOW,
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
                          backgroundColor: "#1a1410",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: "#faf5ec",
                            fontFamily: SERIF,
                            fontWeight: "600",
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
                            style={{
                              color: "#1a1410",
                              fontSize: 16,
                              fontWeight: "700",
                            }}
                          >
                            {m.display_name}
                          </Text>
                          {m.is_owner ? (
                            <View
                              style={{
                                marginLeft: 8,
                                backgroundColor: "#e9dfc8",
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                borderRadius: 6,
                              }}
                            >
                              <Text
                                style={{
                                  color: "#1a1410",
                                  fontSize: 10,
                                  fontWeight: "800",
                                  letterSpacing: 0.8,
                                }}
                              >
                                OWNER
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        {m.role ? (
                          <Text
                            style={{
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
                            backgroundColor: "#efe5d2",
                            marginTop: 12,
                            marginBottom: 12,
                          }}
                        />
                        <Text
                          style={{
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
            <View style={{ marginTop: 14 }}>
              <Text style={sectionHeaderStyle}>FAQ</Text>
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
            <View style={{ marginTop: 14 }}>
              <Text style={sectionHeaderStyle}>Policies</Text>
              <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
                {policy.cancellation_policy ? (
                  <PolicyCard
                    label="Cancellation"
                    value={
                      CANCELLATION_LABEL[policy.cancellation_policy] ??
                      policy.cancellation_policy
                    }
                  />
                ) : null}
                {policy.deposit_pct != null ? (
                  <PolicyCard label="Deposit" value={`${policy.deposit_pct}%`} />
                ) : null}
                {policy.reschedule_window_days != null ? (
                  <PolicyCard
                    label="Reschedule"
                    value={`${policy.reschedule_window_days} days`}
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
                      style={{
                        color: "#1a1410",
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
          backgroundColor: "#ffffff",
          borderTopWidth: 1,
          borderTopColor: "#e8dfcf",
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
                  style={{
                    color: INK_DIM,
                    fontSize: 11,
                    fontWeight: "700",
                    letterSpacing: 0.6,
                  }}
                >
                  FROM
                </Text>
                {/* Manual underline via borderBottom — RN's
                    textDecorationLine on heavy-bold sits right at
                    the line-height box and clips into a ragged bar. */}
                <View
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 2,
                    borderBottomWidth: 2,
                    borderBottomColor: INK,
                    paddingBottom: 2,
                  }}
                >
                  <Text
                    style={{
                      color: INK,
                      fontSize: 22,
                      fontWeight: "800",
                    }}
                  >
                    {price}
                  </Text>
                </View>
              </>
            ) : (
              <Text
                style={{
                  color: "#1a1410",
                  fontSize: 18,
                  fontWeight: "700",
                }}
              >
                Pricing on request
              </Text>
            )}
          </View>
          {/* Children-as-function pattern — Hermes silently drops the
              `style={({pressed}) => …}` form, which on the previous
              build collapsed this pill to text-only (no background,
              no flexDirection). Wrap a View instead so styles always
              land. */}
          <Pressable onPress={() => setInquireOpen(true)}>
            {({ pressed }) => (
              <View
                style={{
                  backgroundColor: "#1a1410",
                  paddingHorizontal: 22,
                  paddingVertical: 14,
                  borderRadius: 999,
                  flexDirection: "row",
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                }}
              >
                <Text
                  style={{
                    color: "#faf5ec",
                    fontSize: 15,
                    fontWeight: "700",
                    marginRight: 6,
                  }}
                >
                  Inquire
                </Text>
                <Feather name="chevron-right" size={16} color="#faf5ec" />
              </View>
            )}
          </Pressable>
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
        color={iconColor ?? "#0a0a0a"}
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
            backgroundColor: iconColor ?? "#dc2626",
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
    <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 8, paddingVertical: 14 }}>
      {top}
      <Text
        style={{
          marginTop: 4,
          color: INK_DIM,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.8,
        }}
      >
        {bottom}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={{ width: 1, backgroundColor: "#ece4d4", marginVertical: 12 }} />;
}

// Collapsible FAQ card — white surface on cream backdrop, question +
// chevron header. Tap toggles the answer; chevron flips down↔up.
function FaqCard({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 10,
        ...CARD_SHADOW,
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
          style={{
            flex: 1,
            paddingRight: 12,
            color: INK,
            fontSize: 15,
            fontWeight: "700",
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
          style={{
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
        backgroundColor: "#ffffff",
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        ...CARD_SHADOW,
      }}
    >
      <Text
        style={{
          color: INK,
          fontSize: 15,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
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
  const schema = getCategorySchema(category);
  if (!schema) return null;

  const populatedSections = schema.sections
    .filter((s) => !s.onlySubs || s.onlySubs.includes(category))
    .filter((s) => s.fields.some((f) => hasAttrValue(attrs[f.key])));

  if (populatedSections.length === 0) return null;

  return (
    <View style={{ marginTop: 26 }}>
      <Text style={sectionHeaderStyle}>Details</Text>
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
  const populated = section.fields.filter((f) => hasAttrValue(attrs[f.key]));
  if (populated.length === 0) return null;

  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          color: INK_DIM,
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 1.2,
          marginBottom: 8,
        }}
      >
        {section.name.toUpperCase()}
      </Text>
      <View
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 18,
          paddingHorizontal: 16,
          paddingVertical: 4,
          ...CARD_SHADOW,
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
        borderBottomColor: "#efe5d2",
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
  if (field.type === "currency" && typeof value === "number") {
    return (
      <RowLabelValue
        label={field.label}
        value={`$${(value / 100).toLocaleString()}`}
      />
    );
  }
  if (field.type === "int" && typeof value === "number") {
    return (
      <RowLabelValue
        label={field.label}
        value={`${value}${field.suffix ? ` ${field.suffix}` : ""}`}
      />
    );
  }
  if (field.type === "boolean" && value === true) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Feather name="check" size={16} color="#1a1410" />
        <Text
          style={{
            marginLeft: 8,
            color: INK,
            fontSize: 15,
            fontWeight: "600",
          }}
        >
          {field.label}
        </Text>
      </View>
    );
  }
  if (field.type === "select" && typeof value === "string" && value) {
    return <RowLabelValue label={field.label} value={value} />;
  }
  if (field.type === "tags") {
    const tags = (value as string[] | undefined) ?? [];
    if (tags.length === 0) return null;
    return (
      <View>
        <Text
          style={{
            color: INK_DIM,
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          {field.label}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {tags.map((t) => (
            <View
              key={t}
              style={{
                backgroundColor: "#efe5d2",
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: INK, fontSize: 12, fontWeight: "600" }}>
                {t}
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
      <Text style={{ flex: 1, color: INK_DIM, fontSize: 14, paddingRight: 12 }}>
        {label}
      </Text>
      <Text
        style={{
          color: INK,
          fontSize: 15,
          fontWeight: "700",
          textAlign: "right",
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
function joinedLabel(iso: string | null | undefined): string {
  if (!iso) return "Recently joined";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "Recently joined";
  const now = new Date();
  const months =
    (now.getFullYear() - then.getFullYear()) * 12 +
    (now.getMonth() - then.getMonth());
  if (months < 1) return "Just joined Vendora";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} on Vendora`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} on Vendora`;
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
  const initial = (
    vendor.business_name?.[0] ??
    owner?.display_name?.[0] ??
    "V"
  ).toUpperCase();
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      <View
        style={{
          marginHorizontal: 18,
          marginTop: 14,
          backgroundColor: "#ffffff",
          borderRadius: 18,
          paddingVertical: 14,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          shadowColor: INK,
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }}
      >
        <CreamOceanAvatar
          size={48}
          logoUrl={vendor.logo_url ?? fallbackLogoUrl}
          initial={initial}
          fontSize={22}
          radius={14}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text
            style={{ color: INK, fontSize: 15, fontWeight: "700" }}
            numberOfLines={1}
          >
            Hosted by {owner?.display_name ?? vendor.business_name ?? "Vendor"}
          </Text>
          <Text
            style={{ marginTop: 2, color: INK_DIM, fontSize: 13 }}
            numberOfLines={1}
          >
            {joinedLabel(vendor.created_at)}
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
        backgroundColor: "#1a1410",
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
            color: "#faf5ec",
            fontFamily: SERIF,
            fontStyle: "italic",
            fontWeight: "700",
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
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ fontSize: 16, color: INK_DIM }}>Close</Text>
          </Pressable>
          <Text
            style={{ fontSize: 17, fontWeight: "600", color: INK, fontFamily: SERIF }}
          >
            Vendor profile
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

          {/* Owner bio (from vendor_team_bios) */}
          {owner?.bio ? (
            <View style={{ marginTop: 22, paddingHorizontal: 22 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  letterSpacing: 1.6,
                  color: INK_DIM,
                }}
              >
                ABOUT {owner.display_name?.toUpperCase()}
              </Text>
              <Text
                style={{
                  marginTop: 10,
                  color: INK,
                  fontSize: 15,
                  lineHeight: 22,
                  fontStyle: "italic",
                  fontFamily: SERIF,
                }}
              >
                {owner.bio}
              </Text>
            </View>
          ) : null}

          {/* Feed tabs — mirrors the vendor's own profile (Posts /
              Reels / Buzz / Listings) read-only. No edit buttons,
              no Create CTAs. */}
          <View style={{ marginTop: 28 }}>
            <View
              style={{
                flexDirection: "row",
                paddingHorizontal: 16,
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <SheetTabPill
                active={tab === "posts"}
                label="Posts"
                count={counts.posts}
                onPress={() => setTab("posts")}
              />
              <SheetTabPill
                active={tab === "reels"}
                label="Reels"
                count={counts.reels}
                onPress={() => setTab("reels")}
              />
              <SheetTabPill
                active={tab === "buzz"}
                label="Buzz"
                count={counts.buzz}
                onPress={() => setTab("buzz")}
              />
              <SheetTabPill
                active={tab === "listings"}
                label="Listings"
                count={counts.listings}
                onPress={() => setTab("listings")}
              />
            </View>

            <View style={{ paddingHorizontal: 12, paddingTop: 14 }}>
              {tab === "posts" ? (
                posts.length === 0 ? (
                  <SheetEmpty body="No posts yet." />
                ) : (
                  <SheetPostGrid posts={posts} />
                )
              ) : tab === "reels" ? (
                reels.length === 0 ? (
                  <SheetEmpty body="No reels yet." />
                ) : (
                  <SheetReelGrid reels={reels} />
                )
              ) : tab === "buzz" ? (
                buzz.length === 0 ? (
                  <SheetEmpty body="No buzz yet." />
                ) : (
                  <SheetBuzzList items={buzz} />
                )
              ) : otherListings.length === 0 ? (
                <SheetEmpty body="No listings yet." />
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
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: active ? INK : "#ffffff",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text
          style={{
            color: active ? "#faf5ec" : INK,
            fontSize: 13,
            fontWeight: "700",
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: active ? "#faf5ec" : INK_DIM,
            fontSize: 13,
            fontWeight: "600",
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
          fontFamily: SERIF,
          fontStyle: "italic",
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
              backgroundColor: "#efe5d2",
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
              backgroundColor: "#1a1410",
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
  return (
    <View style={{ gap: 10, paddingTop: 4 }}>
      {items.map((b) => (
        <View
          key={b.id}
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 14,
            padding: 14,
            marginHorizontal: 4,
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
          <Text style={{ marginTop: 6, color: INK_DIM, fontSize: 12 }}>
            {new Date(b.created_at).toLocaleDateString()}
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
  return (
    <View style={{ gap: 10, paddingTop: 4 }}>
      {listings.map((l) => {
        const isCurrent = l.id === currentId;
        return (
          <Pressable key={l.id} onPress={() => onPress(l.id)}>
            <View
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 14,
                padding: 12,
                marginHorizontal: 4,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderWidth: isCurrent ? 1.5 : 0,
                borderColor: isCurrent ? INK : "transparent",
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
                    backgroundColor: INK,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#faf5ec",
                      fontFamily: SERIF,
                      fontSize: 18,
                      fontWeight: "600",
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
                    style={{ color: INK, fontSize: 15, fontWeight: "700", flexShrink: 1 }}
                    numberOfLines={1}
                  >
                    {l.business_name ?? "Listing"}
                  </Text>
                  {isCurrent ? (
                    <View
                      style={{
                        backgroundColor: INK,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 999,
                      }}
                    >
                      <Text
                        style={{
                          color: "#faf5ec",
                          fontSize: 9,
                          fontWeight: "800",
                          letterSpacing: 0.6,
                        }}
                      >
                        VIEWING
                      </Text>
                    </View>
                  ) : null}
                </View>
                {l.category ? (
                  <Text
                    style={{ marginTop: 2, color: INK_DIM, fontSize: 13 }}
                    numberOfLines={1}
                  >
                    {l.category}
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
    <View style={{ flex: 1, paddingHorizontal: 14, alignItems: "center" }}>
      <Text
        style={{
          fontSize: 10,
          fontWeight: "800",
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
  const CARD_W = Dimensions.get("window").width - 36;
  const CARD_H = 230;

  // Flip animation using RN's built-in Animated. Plain React state
  // tracks the "facing" side so we can gate pointerEvents — the
  // backface-visibility trick hides rendering but the View still
  // captures touches, which is what was breaking the flip button.
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);
  const toggleFlip = () => {
    const next = !flipped;
    setFlipped(next);
    Animated.timing(flipAnim, {
      toValue: next ? 1 : 0,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };

  const frontRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const backRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });
  // Opacity gating snaps the visible face at 50% of the flip — guards
  // against iOS builds where backfaceVisibility:"hidden" doesn't kick
  // in and the back face leaks through (blank front face symptom).
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.49, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.51, 1],
    outputRange: [0, 0, 1, 1],
  });
  const frontStyle = {
    opacity: frontOpacity,
    transform: [{ perspective: 1000 }, { rotateY: frontRotate }],
  };
  const backStyle = {
    opacity: backOpacity,
    transform: [{ perspective: 1000 }, { rotateY: backRotate }],
  };

  return (
    <View
      style={{
        marginHorizontal: 18,
        marginTop: 12,
        height: CARD_H,
      }}
    >
      {/* Front — pointerEvents disabled when flipped so the hidden
          face doesn't intercept taps on the visible back. */}
      <Animated.View
        pointerEvents={flipped ? "none" : "auto"}
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 22,
            backgroundColor: "#fffbf2",
            borderWidth: 1,
            borderColor: "#ebe1ce",
            overflow: "hidden",
            shadowColor: INK,
            shadowOpacity: 0.1,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 4,
            backfaceVisibility: "hidden",
          },
          frontStyle,
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
      </Animated.View>

      {/* Back — same pointerEvents gating, inverted. */}
      <Animated.View
        pointerEvents={flipped ? "auto" : "none"}
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 22,
            backgroundColor: "#fffbf2",
            borderWidth: 1,
            borderColor: "#ebe1ce",
            overflow: "hidden",
            shadowColor: INK,
            shadowOpacity: 0.1,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 4,
            backfaceVisibility: "hidden",
          },
          backStyle,
        ]}
      >
        <CreamOceanBack
          vendor={vendor}
          width={CARD_W}
          height={CARD_H}
          onFlip={toggleFlip}
        />
      </Animated.View>
    </View>
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
            <Stop offset="0" stopColor="#fffbf2" />
            <Stop offset="1" stopColor="#faecd0" />
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

      <View style={{ padding: 18 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 18,
            marginBottom: 18,
          }}
        >
          <View
            style={{
              shadowColor: INK,
              shadowOpacity: 0.3,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }}
          >
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
                  backgroundColor: "#b8472f",
                  borderWidth: 3,
                  borderColor: "#fffbf2",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="check" size={11} color="#ffffff" />
              </View>
            ) : null}
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: SERIF,
                fontStyle: "italic",
                fontWeight: "700",
                fontSize: 32,
                lineHeight: 34,
                letterSpacing: -0.6,
                color: INK,
                marginBottom: 6,
                paddingRight: 28,
              }}
              numberOfLines={2}
            >
              {vendor.business_name ?? "Vendor"}
            </Text>
            {vendor.location ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Feather name="map-pin" size={12} color="#9c8f80" />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "500",
                    color: "#5a4f44",
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
            backgroundColor: "rgba(255, 251, 242, 0.65)",
            borderWidth: 1,
            borderColor: "rgba(235, 225, 206, 0.7)",
            borderRadius: 14,
            paddingVertical: 12,
            shadowColor: INK,
            shadowOpacity: 0.05,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 2 },
            elevation: 1,
          }}
        >
          <CreamOceanStat label="Bookings" value="0" />
          <View
            style={{ width: 1, backgroundColor: "rgba(235, 225, 206, 0.7)" }}
          />
          <CreamOceanStat label="Rating" value="—" italic />
          <View
            style={{ width: 1, backgroundColor: "rgba(235, 225, 206, 0.7)" }}
          />
          <CreamOceanStat
            label="Joined"
            value={shortJoined(vendor.created_at)}
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
          backgroundColor: "rgba(255, 251, 242, 0.85)",
          borderWidth: 1,
          borderColor: "rgba(235, 225, 206, 0.7)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name="rotate-cw" size={14} color="#5a4f44" />
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
            <Stop offset="0" stopColor="#fffbf2" />
            <Stop offset="1" stopColor="#faecd0" />
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

      {/* Bio takes the back face — italic serif paragraph centered on
          the card. Falls back to a short prompt when the vendor hasn't
          set a bio yet. Matches the vendor-side flip card. */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 22,
          paddingTop: 26,
          paddingBottom: 18,
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontFamily: SERIF,
            fontStyle: "italic",
            color: INK,
            fontSize: hasBio ? 17 : 16,
            lineHeight: hasBio ? 24 : 22,
          }}
          numberOfLines={6}
        >
          {hasBio ? vendor.bio : "No bio yet."}
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
          backgroundColor: "rgba(255, 251, 242, 0.85)",
          borderWidth: 1,
          borderColor: "rgba(235, 225, 206, 0.7)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name="rotate-ccw" size={14} color="#5a4f44" />
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
        style={{
          fontSize: 9,
          fontWeight: "700",
          letterSpacing: 1.8,
          textTransform: "uppercase",
          color: "#9c8f80",
          marginBottom: 3,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: SERIF,
          fontWeight: italic ? "500" : "600",
          fontStyle: italic ? "italic" : "normal",
          fontSize: italic ? 14 : 16,
          color: italic ? "#5a4f44" : INK,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function shortJoined(iso: string | null | undefined): string {
  if (!iso) return "today";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "today";
  const now = new Date();
  const isSameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  if (isSameDay) return "today";
  const months =
    (now.getFullYear() - then.getFullYear()) * 12 +
    (now.getMonth() - then.getMonth());
  if (months < 12) {
    return then.toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  }
  return String(then.getFullYear());
}
