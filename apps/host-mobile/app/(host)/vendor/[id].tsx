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

import { useCallback, useEffect, useState } from "react";
import {
  Dimensions,
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
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { InquiryComposer } from "@/components/InquiryComposer";

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
          "id, business_name, category, bio, location, base_price_cents, application_status, slug, verified_at, logo_url, created_at, deposit_pct, cancellation_policy, reschedule_window_days, policy_notes",
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
  onPress,
}: {
  vendor: VendorRow;
  owner: TeamRow | null;
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
        {vendor.logo_url ? (
          <Image
            source={{ uri: vendor.logo_url }}
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: CREAM }}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: INK,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: "#faf5ec",
                fontFamily: SERIF,
                fontWeight: "600",
                fontSize: 20,
              }}
            >
              {initial}
            </Text>
          </View>
        )}
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

function VendorProfileSheet({
  visible,
  vendor,
  owner,
  onClose,
}: {
  visible: boolean;
  vendor: VendorRow;
  owner: TeamRow | null;
  onClose: () => void;
}) {
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
          {/* Big avatar + name */}
          <View style={{ alignItems: "center", paddingTop: 16 }}>
            {vendor.logo_url ? (
              <Image
                source={{ uri: vendor.logo_url }}
                style={{
                  width: 110,
                  height: 110,
                  borderRadius: 26,
                  backgroundColor: "#ffffff",
                }}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View
                style={{
                  width: 110,
                  height: 110,
                  borderRadius: 26,
                  backgroundColor: INK,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: "#faf5ec",
                    fontFamily: SERIF,
                    fontWeight: "600",
                    fontSize: 44,
                  }}
                >
                  {initial}
                </Text>
              </View>
            )}
            <Text
              style={{
                marginTop: 14,
                color: INK,
                fontFamily: SERIF,
                fontStyle: "italic",
                fontSize: 26,
                fontWeight: "600",
                textAlign: "center",
                paddingHorizontal: 24,
              }}
              numberOfLines={2}
            >
              {vendor.business_name ?? "Vendor"}
            </Text>
            {vendor.category ? (
              <Text
                style={{
                  marginTop: 4,
                  color: INK_DIM,
                  fontSize: 14,
                }}
              >
                {vendor.category}
              </Text>
            ) : null}
            {vendor.verified_at ? (
              <View
                style={{
                  marginTop: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: "#1a1410",
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 999,
                }}
              >
                <Feather name="check-circle" size={13} color="#faf5ec" />
                <Text
                  style={{
                    color: "#faf5ec",
                    fontSize: 11,
                    fontWeight: "800",
                    letterSpacing: 0.6,
                  }}
                >
                  VERIFIED
                </Text>
              </View>
            ) : null}
          </View>

          {/* Stats: time on Vendora + location */}
          <View
            style={{
              marginTop: 26,
              marginHorizontal: 20,
              backgroundColor: "#ffffff",
              borderRadius: 18,
              paddingVertical: 16,
              flexDirection: "row",
            }}
          >
            <ProfileSheetStat
              label="On Vendora"
              value={joinedLabel(vendor.created_at)}
            />
            <View style={{ width: 1, backgroundColor: "#efe5d2" }} />
            <ProfileSheetStat
              label="Based in"
              value={vendor.location ?? "—"}
            />
          </View>

          {/* Bio */}
          {vendor.bio ? (
            <View style={{ marginTop: 26, paddingHorizontal: 22 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  letterSpacing: 1.6,
                  color: INK_DIM,
                }}
              >
                ABOUT
              </Text>
              <Text
                style={{
                  marginTop: 10,
                  color: INK,
                  fontSize: 15,
                  lineHeight: 22,
                }}
              >
                {vendor.bio}
              </Text>
            </View>
          ) : null}

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
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
