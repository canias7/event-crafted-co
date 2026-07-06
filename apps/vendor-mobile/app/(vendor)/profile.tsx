// Profile tab — listings-only identity hub. Mirrors the web vendor
// "My Profile" (apps/web/.../VendorMyProfilePage): vendors manage their
// account identity (logo, name, bio) and their marketplace listings
// here, nothing else. The old Instagram-style Posts / Reels / Buzz
// system was removed — that moved to the host side, same as web.
//
// A vendor account can own multiple vendor_profiles rows; each row IS a
// listing. Each listing's photos live in vendor_portfolio_images (bucket
// vendor-portfolios), keyed by vendor_id — the SAME photos the Gallery
// tab and the listing builder manage. The first photo (display_order)
// is the listing's cover.

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { formatListingPrice, pricingModelsLabel } from "@vendora/core";
import type { VendorProfile } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Web palette (apps/web/src/index.css): white surfaces, deep-navy
// accent, cool neutral grays. No warm cream/champagne.
const WHITE = "#ffffff";
const SURFACE = "#f3f4f6";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const BORDER = "#e5e7eb";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

// Joined year for the header stat (matches web's "Joined" stat).
function joinedYear(createdAt: string | null): string {
  if (!createdAt) return "—";
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? "—" : String(d.getFullYear());
}

// Listing ordering (mirrors web VendorMyProfilePage): approved (live)
// listings first, then pending/submitted, then everything else
// (draft / rejected / null). created_at ASC breaks ties.
function statusRank(s: string | null): number {
  if (s === "approved") return 0;
  if (s === "pending" || s === "submitted") return 1;
  return 2;
}

// Status pill copy + tones for a listing card (matches web's Live /
// Pending review / Rejected / Draft directory-card pills).
function statusMeta(s: string | null): { label: string; bg: string; fg: string } {
  if (s === "approved") return { label: "Live", bg: "#d1fae5", fg: "#047857" };
  if (s === "rejected") return { label: "Rejected", bg: "#fee2e2", fg: "#b91c1c" };
  if (s === "pending" || s === "submitted")
    return { label: "Pending review", bg: "rgba(20,22,26,0.08)", fg: "#374151" };
  return { label: "Draft", bg: "rgba(20,22,26,0.08)", fg: "#374151" };
}

// Studio-tier verified seal — the 16-point starburst + check used on
// web (StudioVerifiedBadge). Solid fill instead of the web gradient.
function StudioBadge({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path
        d="M32 2 L36 6.5 L42 4.5 L44 10 L50 10 L50 16 L55.5 18 L53.5 24 L58 28 L54 32 L58 36 L53.5 40 L55.5 46 L50 48 L50 54 L44 54 L42 59.5 L36 57.5 L32 62 L28 57.5 L22 59.5 L20 54 L14 54 L14 48 L8.5 46 L10.5 40 L6 36 L10 32 L6 28 L10.5 24 L8.5 18 L14 16 L14 10 L20 10 L22 4.5 L28 6.5 Z"
        fill="#1d6dde"
      />
      <Path
        d="M21 33 L29 41 L44 24"
        fill="none"
        stroke="#ffffff"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();

  // Identity lives on public.profiles (separate from any one listing —
  // migration 20260512150000). Falls back to the primary vendor_profiles
  // row when the profile columns are still null.
  const [identity, setIdentity] = useState<{
    business_name: string | null;
    category: string | null;
    location: string | null;
    bio: string | null;
    logo_url: string | null;
  }>({
    business_name: null,
    category: null,
    location: null,
    bio: null,
    logo_url: null,
  });
  const [profileCreatedAt, setProfileCreatedAt] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  // Subscription tier (per-user, on profiles). Pro and Premium
  // ('studio' slug) show the verified seal next to the name,
  // mirroring web's StudioVerifiedBadge.
  const [tier, setTier] = useState<string>("free");
  // Plan listing cap (Free 1 / Pro 4 / Premium 10, null = unlimited
  // grandfather flag). Drives whether "New listing" shows once
  // listings exist; the same cap is enforced server-side.
  const [listingCap, setListingCap] = useState<number | null>(1);
  // Every vendor_profiles row this user owns = their listings.
  const [listings, setListings] = useState<VendorProfile[]>([]);
  // Header rating — average of HOST reviews of this vendor (matches
  // web; averaging all reviews would fold in the vendor's outgoing
  // ratings of hosts and inflate the score).
  const [ratingAvg, setRatingAvg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const [{ data: vpData }, { data: identityData }, { data: capData }] =
      await Promise.all([
        supabase
          .from("vendor_profiles")
          .select(
            "id, business_name, category, bio, base_price_cents, pricing_models, price_min_cents, price_max_cents, custom_pricing, location, verified_at, application_status, slug, logo_url, created_at",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("profiles")
          .select(
            "business_name, category, location, bio, logo_url, created_at, subscription_tier",
          )
          .eq("id", user.id)
          .maybeSingle(),
        // Plan listing cap via RPC (covers the unlimited_listings
        // grandfather flag the client can't derive from tier alone).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc("user_listing_cap", { p_user_id: user.id }),
      ]);
    setListingCap(typeof capData === "number" ? capData : null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (vpData ?? []) as any[];
    // Approved listings first, then pending, then drafts/rejected —
    // created_at ASC breaks ties (matches web).
    rows.sort((a, b) => {
      const r = statusRank(a.application_status) - statusRank(b.application_status);
      if (r !== 0) return r;
      return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    });
    setListings(rows as VendorProfile[]);
    const primary = rows[0] ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id: any = identityData ?? {};
    setIdentity({
      business_name: id.business_name ?? primary?.business_name ?? null,
      category: id.category ?? primary?.category ?? null,
      location: id.location ?? primary?.location ?? null,
      bio: id.bio ?? primary?.bio ?? null,
      logo_url: id.logo_url ?? primary?.logo_url ?? null,
    });
    setProfileCreatedAt(id.created_at ?? primary?.created_at ?? null);
    setVerifiedAt(primary?.verified_at ?? null);
    setTier(typeof id.subscription_tier === "string" ? id.subscription_tier : "free");
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Refresh when returning from Edit profile / the listing builder.
  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  // Header rating = average of HOST reviews across all listings. The
  // rater_role='host' filter matches web — without it the average would
  // also include the vendor's outgoing ratings of hosts and lie.
  useEffect(() => {
    if (listings.length === 0) {
      setRatingAvg(null);
      return;
    }
    const vendorIds = listings.map((l) => l.id);
    let cancelled = false;
    (async () => {
      const { data: reviewRows } = await supabase
        .from("reviews")
        .select("rating")
        .in("vendor_id", vendorIds)
        .eq("rater_role", "host");
      if (cancelled) return;
      const ratings = ((reviewRows ?? []) as { rating: number | null }[])
        .map((r) => r.rating)
        .filter((r): r is number => typeof r === "number");
      setRatingAvg(
        ratings.length === 0
          ? null
          : Math.round((ratings.reduce((s, n) => s + n, 0) / ratings.length) * 10) / 10,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [listings]);

  async function shareProfile() {
    const primary = listings[0];
    if (!primary) return;
    const slugOrId = primary.slug ?? primary.id;
    const url = `https://eventvendora.com/vendors/${slugOrId}`;
    await Share.share({
      message: `${identity.business_name ?? "Check out my listing"} on Vendora — ${url}`,
      url,
    }).catch(() => {});
  }

  function openEditProfile() {
    router.push("/(vendor)/edit-profile" as never);
  }

  // Insert a fresh draft listing and jump to its editor.
  async function createNewListing() {
    if (!user?.id) return;
    // Plan cap pre-check (Free 1 / Pro 4 / Premium 10). The server
    // enforces the same cap via trg_enforce_listing_cap; this just
    // gives a friendlier message than the raised exception.
    if (listingCap !== null && listings.length >= listingCap) {
      Alert.alert(
        "Listing limit reached",
        `Your plan allows ${listingCap} listing${listingCap === 1 ? "" : "s"}. Upgrade your plan on the web to add more.`,
      );
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vendor_profiles")
      .insert({ user_id: user.id, application_status: "draft" })
      .select("id")
      .single();
    if (error || !data?.id) {
      Alert.alert(
        "Couldn't create listing",
        error?.message?.includes("listing_cap_reached")
          ? "Your plan's listing limit is reached. Upgrade your plan on the web to add more."
          : (error?.message ?? "Unknown error"),
      );
      return;
    }
    await loadProfile();
    router.push(`/(vendor)/listing?id=${data.id}` as never);
  }

  return (
    <View style={{ flex: 1, backgroundColor: WHITE }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: WHITE }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Page header — mirrors web "My Profile". */}
          <Text
            style={{
              fontFamily: SERIF,
              fontStyle: "italic",
              fontWeight: "700",
              fontSize: 34,
              color: INK,
            }}
          >
            My Profile
          </Text>
          <Text style={{ marginTop: 2, fontSize: 13, color: INK_DIM }}>
            Your listings — manage your marketplace presence here.
          </Text>

          {/* Brand identity card — mirrors web BrandCardShell + HeaderCard:
              gradient + ripple shell, a Bio flip-chip, avatar / name /
              RATING·JOINED / Share profile + Edit identity. */}
          <View style={{ marginTop: 16 }}>
            <BrandCard
              logoUrl={identity.logo_url}
              businessName={identity.business_name ?? user?.email ?? "Vendor"}
              bio={identity.bio}
              ratingAvg={ratingAvg}
              joined={joinedYear(profileCreatedAt)}
              verified={!!verifiedAt}
              studio={tier === "studio" || tier === "pro"}
              onShare={shareProfile}
              onEditIdentity={openEditProfile}
            />
          </View>

          {/* New listing + listings grid. */}
          <View style={{ marginTop: 22 }}>
            <ListingTab
              loading={loading}
              listings={listings}
              listingCap={listingCap}
              onEdit={(id) => router.push(`/(vendor)/listing?id=${id}` as never)}
              onCreateNew={createNewListing}
              onChanged={loadProfile}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// Brand identity card — the mobile mirror of web's BrandCardShell +
// HeaderCard. A white→#f3f4f6 gradient shell with faint ripple lines, a
// top-left Bio chip that flips the card to the vendor's bio, and a front
// face holding the avatar, name, RATING/JOINED, Share profile + Edit
// identity buttons.
function BrandCard({
  logoUrl,
  businessName,
  bio,
  ratingAvg,
  joined,
  verified,
  studio,
  onShare,
  onEditIdentity,
}: {
  logoUrl: string | null;
  businessName: string;
  bio: string | null;
  ratingAvg: number | null;
  joined: string;
  verified: boolean;
  studio: boolean;
  onShare: () => void;
  onEditIdentity: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <View
      style={{
        borderRadius: 28,
        borderWidth: 1,
        borderColor: "#e4e4e7",
        overflow: "hidden",
        backgroundColor: WHITE,
        minHeight: 312,
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
      }}
    >
      <CardCanvas />

      {/* Bio / Back flip chip — top-left, matches web. */}
      <Pressable
        onPress={() => setFlipped((f) => !f)}
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 5,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "rgba(255,255,255,0.7)",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "rgba(0,0,0,0.28)",
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 5,
        }}
      >
        <Feather name={flipped ? "rotate-ccw" : "info"} size={11} color={INK} />
        <Text
          style={{
            marginLeft: 5,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.8,
            color: INK,
          }}
        >
          {flipped ? "BACK" : "BIO"}
        </Text>
      </Pressable>

      {flipped ? (
        <View style={{ padding: 22, paddingTop: 52 }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 2,
              color: INK_DIM,
            }}
          >
            ABOUT {businessName.toUpperCase()}
          </Text>
          <Text
            style={{
              marginTop: 12,
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: 18,
              lineHeight: 27,
              color: bio?.trim() ? "rgba(20,22,26,0.85)" : INK_DIM,
            }}
          >
            {bio?.trim() ? bio : `No bio yet for ${businessName}.`}
          </Text>
        </View>
      ) : (
        <View style={{ padding: 22, paddingTop: 52, alignItems: "center" }}>
          {/* Avatar with verified + studio badges. */}
          <View style={{ alignSelf: "flex-start" }}>
            <Avatar logoUrl={logoUrl} />
            {verified ? (
              <View
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: "#10b981",
                  borderWidth: 3,
                  borderColor: WHITE,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="check" size={11} color={WHITE} />
              </View>
            ) : null}
            {studio ? (
              <View style={{ position: "absolute", top: -6, right: -6 }}>
                <StudioBadge size={24} />
              </View>
            ) : null}
          </View>

          <Text
            numberOfLines={2}
            style={{
              marginTop: 16,
              textAlign: "center",
              fontFamily: SERIF,
              fontStyle: "italic",
              fontWeight: "700",
              fontSize: 30,
              lineHeight: 34,
              letterSpacing: -0.5,
              color: INK,
            }}
          >
            {businessName}
          </Text>

          <View
            style={{
              marginTop: 16,
              flexDirection: "row",
              justifyContent: "center",
              gap: 48,
            }}
          >
            <CardStat
              value={ratingAvg != null ? ratingAvg.toFixed(1) : "—"}
              label="RATING"
            />
            <CardStat value={joined} label="JOINED" />
          </View>

          <View style={{ marginTop: 20, gap: 10, alignSelf: "stretch", alignItems: "center" }}>
            <OutlineBtn icon="share-2" label="Share profile" onPress={onShare} />
            <OutlineBtn icon="edit-2" label="Edit identity" onPress={onEditIdentity} />
          </View>
        </View>
      )}
    </View>
  );
}

// Gradient + ripple-line backdrop behind the brand card content.
function CardCanvas() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="brandgrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#ffffff" />
            <Stop offset="1" stopColor="#f3f4f6" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#brandgrad)" />
      </Svg>
      {[0.32, 0.48, 0.62, 0.76].map((t, i) => (
        <View
          key={t}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${t * 100}%`,
            height: 1.5,
            backgroundColor: `rgba(0,0,0,${0.06 - i * 0.012})`,
          }}
        />
      ))}
    </View>
  );
}

function CardStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: INK }}>{value}</Text>
      <Text
        style={{
          marginTop: 2,
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 1.2,
          color: INK_DIM,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function OutlineBtn({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "stretch",
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: "rgba(255,255,255,0.75)",
        borderRadius: 999,
        paddingVertical: 11,
      }}
    >
      <Feather name={icon} size={14} color={INK} />
      <Text style={{ marginLeft: 7, fontSize: 14, fontWeight: "600", color: INK }}>
        {label}
      </Text>
    </Pressable>
  );
}

// Circular avatar — vendor logo when set, else web's neutral person
// silhouette on a warm gray.
function Avatar({ logoUrl }: { logoUrl: string | null }) {
  return (
    <View
      style={{
        width: 96,
        height: 96,
        borderRadius: 48,
        overflow: "hidden",
        backgroundColor: logoUrl ? WHITE : "#e5e1da",
        borderWidth: 1,
        borderColor: BORDER,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Feather name="user" size={44} color="#9b948a" />
      )}
    </View>
  );
}

function EmptyState({
  icon,
  title,
  body,
  ctaLabel,
  onCta,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <View className="items-center">
      <View className="h-16 w-16 items-center justify-center rounded-full border border-border">
        <Feather name={icon} size={24} color={INK_DIM} />
      </View>
      <Text className="mt-4 text-lg font-semibold text-foreground">{title}</Text>
      <Text className="mt-1 text-center text-base text-muted-foreground">{body}</Text>
      {ctaLabel && onCta ? (
        <Pressable
          onPress={onCta}
          className="mt-5 rounded-full bg-foreground px-6 py-2.5 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-background">{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Renders every vendor_profiles row this user owns as its own card —
// approved+complete listings as photo cards, drafts/rejected as rows,
// pending as a dimmed "under review" card. An "Add another listing" tile
// closes the list.
function ListingTab({
  loading,
  listings,
  listingCap,
  onEdit,
  onCreateNew,
  onChanged,
}: {
  loading: boolean;
  listings: VendorProfile[];
  /** Plan cap (Free 1 / Pro 4 / Premium 10); null = unlimited. */
  listingCap: number | null;
  onEdit: (id: string) => void;
  onCreateNew: () => void;
  onChanged: () => void;
}) {
  if (loading) {
    return (
      <View className="items-center px-4 pt-10">
        <Text className="text-sm text-muted-foreground">Loading…</Text>
      </View>
    );
  }
  if (listings.length === 0) {
    return (
      <View className="items-center px-4 pt-10">
        <EmptyState
          icon="shopping-bag"
          title="No listings yet"
          body="Add your location and starting price to publish your listing to the marketplace."
          ctaLabel="Create listing"
          onCta={onCreateNew}
        />
      </View>
    );
  }
  const underCap = listingCap === null || listings.length < listingCap;
  return (
    <View style={{ gap: 18 }}>
      {/* Plan-based listing caps: Free 1 / Pro 4 / Premium 10. The
          "New listing" button shows while the account is under its
          cap (enforced server-side too via trg_enforce_listing_cap). */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 12, color: INK_DIM }}>
          {listings.length}
          {listingCap !== null ? ` of ${listingCap}` : ""} listing
          {listingCap === 1 && listings.length === 1 ? "" : "s"}
        </Text>
        {underCap ? (
          <Pressable
            onPress={onCreateNew}
            hitSlop={8}
            style={{
              borderWidth: 1,
              borderColor: "rgba(0,0,0,0.18)",
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 7,
              backgroundColor: "#fff",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: INK }}>
              New listing
            </Text>
          </Pressable>
        ) : (
          <Text style={{ fontSize: 12, color: INK_DIM }}>
            Upgrade for more listings
          </Text>
        )}
      </View>
      {listings.map((l) => (
        <ListingCard
          key={l.id}
          listing={l}
          onEdit={() => onEdit(l.id)}
          onChanged={onChanged}
        />
      ))}
    </View>
  );
}

function ListingCard({
  listing,
  onEdit,
  onChanged,
}: {
  listing: VendorProfile;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const status = listing.application_status ?? "draft";
  const isApproved = status === "approved";
  const isPending = status === "pending";
  const meta = statusMeta(status);

  // Cover = first portfolio image (the gallery photos for this listing).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("vendor_portfolio_images")
        .select("storage_path")
        .eq("vendor_id", listing.id)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1);
      if (cancelled) return;
      const row = (data ?? [])[0] as { storage_path: string } | undefined;
      if (!row) {
        setHeroUrl(null);
        return;
      }
      const { data: pub } = supabase.storage
        .from("vendor-portfolios")
        .getPublicUrl(row.storage_path);
      setHeroUrl(pub.publicUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [listing.id]);

  async function unpublish() {
    Alert.alert(
      "Remove from marketplace?",
      "Your listing leaves the marketplace but your photos, packages, and other data stay. You can re-publish anytime.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
              .from("vendor_profiles")
              .update({ application_status: "draft" })
              .eq("id", listing.id);
            setBusy(false);
            if (error) Alert.alert("Couldn't remove listing", error.message);
            else onChanged();
          },
        },
      ],
    );
  }

  async function destroy() {
    Alert.alert(
      "Delete this listing?",
      "All photos, packages, FAQs, and inquiries tied to this listing will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc(
              "delete_my_vendor_profile",
              { p_vendor_id: listing.id },
            );
            setBusy(false);
            if (error) Alert.alert("Couldn't delete listing", error.message);
            else onChanged();
          },
        },
      ],
    );
  }

  // Every listing renders as the same directory-style card with a
  // status pill (matches web's VendorMyProfilePage grid): cover photo
  // (4:3) on top, name / category·location / price below. Pending
  // listings dim under an "Under review" overlay; everything else
  // exposes quick edit / unpublish / delete actions.
  return (
    <Pressable onPress={onEdit} className="active:opacity-90">
      <View
        style={{
          borderRadius: 18,
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
          aspectRatio: 4 / 3,
          width: "100%",
        }}
      >
        {heroUrl ? (
          <Image
            source={{ uri: heroUrl }}
            style={{ flex: 1, opacity: isPending ? 0.35 : 1 }}
            resizeMode="cover"
            blurRadius={isPending ? 8 : 0}
          />
        ) : (
          <View
            className="flex-1 items-center justify-center px-6"
            style={{ backgroundColor: SURFACE }}
          >
            <Feather name="image" size={28} color="#a1a1aa" />
            <Text className="mt-2 text-center text-xs text-muted-foreground">
              No listing photos yet
            </Text>
          </View>
        )}

        {/* Status pill — top-left on every card. */}
        <View
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            backgroundColor: meta.bg,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: meta.fg }}>
            {meta.label}
          </Text>
        </View>

        {isPending ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.4)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="clock" size={28} color="#fff" />
            <Text className="mt-2 text-center text-xs font-semibold text-white">
              Under review
            </Text>
          </View>
        ) : (
          <View
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              flexDirection: "row",
              gap: 8,
            }}
          >
            <CardAction icon="edit-2" onPress={onEdit} disabled={busy} />
            {isApproved ? (
              <CardAction icon="eye-off" onPress={unpublish} disabled={busy} />
            ) : null}
            <CardAction icon="trash-2" color="#dc2828" onPress={destroy} disabled={busy} />
          </View>
        )}
      </View>
      <View className="mt-3 px-1">
        <Text
          numberOfLines={1}
          className={
            isPending
              ? "text-base font-semibold text-foreground/70"
              : "text-base font-semibold text-foreground"
          }
        >
          {listing.business_name?.trim() || listing.category || "Your listing"}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-sm text-muted-foreground">
          {listing.category ?? "—"}
          {listing.location ? ` · ${listing.location}` : ""}
        </Text>
        {formatListingPrice(listing.price_min_cents, listing.price_max_cents) ? (
          <Text className="mt-1 text-sm text-foreground/80">
            {formatListingPrice(listing.price_min_cents, listing.price_max_cents)}
          </Text>
        ) : null}
        {(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const models = pricingModelsLabel((listing as any).pricing_models);
          return models ? (
            <Text
              style={{ fontSize: 12, color: INK_DIM, marginTop: 2 }}
              numberOfLines={1}
            >
              {models}
            </Text>
          ) : null;
        })()}
      </View>
    </Pressable>
  );
}

function CardAction({
  icon,
  onPress,
  disabled,
  color = "#14161a",
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      disabled={disabled}
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.92)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Feather name={icon} size={16} color={color} />
    </Pressable>
  );
}
