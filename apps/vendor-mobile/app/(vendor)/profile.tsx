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
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import type { VendorProfile } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { SettingsSheet } from "@/components/SettingsSheet";

// Web palette (apps/web/src/index.css): white surfaces, deep-navy
// accent, cool neutral grays. No warm cream/champagne.
const WHITE = "#ffffff";
const SURFACE = "#f3f4f6";
const INK = "#14161a";
const INK_DIM = "#5e636e";
const ACCENT = "#1b3654";
const BORDER = "#e5e7eb";
const SERIF = Platform.OS === "ios" ? "Times New Roman" : "serif";

function joinedLabel(createdAt: string | null): string {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "Joined today";
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days < 7) return `Joined ${days}d ago`;
  if (days < 30) return `Joined ${Math.floor(days / 7)}w ago`;
  if (days < 365) {
    return `Joined ${d.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
  }
  return `Joined ${d.toLocaleDateString(undefined, { year: "numeric" })}`;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

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
  // Every vendor_profiles row this user owns = their listings.
  const [listings, setListings] = useState<VendorProfile[]>([]);
  const [stats, setStats] = useState<{
    bookings: number;
    reviews: number;
    rating: number | null;
  }>({ bookings: 0, reviews: 0, rating: null });
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const [{ data: vpData }, { data: identityData }] = await Promise.all([
      supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, category, bio, base_price_cents, location, verified_at, application_status, slug, logo_url, created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("profiles")
        .select("business_name, category, location, bio, logo_url, created_at")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (vpData ?? []) as any[];
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

  // Stats: bookings = won inquiries across all listings; reviews + rating
  // = aggregate of public reviews on those listings.
  useEffect(() => {
    if (listings.length === 0) {
      setStats({ bookings: 0, reviews: 0, rating: null });
      return;
    }
    const vendorIds = listings.map((l) => l.id);
    let cancelled = false;
    (async () => {
      const [{ count: bookings }, { data: reviewRows }] = await Promise.all([
        supabase
          .from("inquiries")
          .select("id", { count: "exact", head: true })
          .in("vendor_id", vendorIds)
          .eq("status", "won"),
        supabase.from("reviews").select("rating").in("vendor_id", vendorIds),
      ]);
      if (cancelled) return;
      const rs = (reviewRows ?? []) as { rating: number | null }[];
      const ratings = rs
        .map((r) => r.rating)
        .filter((r): r is number => typeof r === "number");
      const avg =
        ratings.length === 0
          ? null
          : Math.round((ratings.reduce((s, n) => s + n, 0) / ratings.length) * 10) / 10;
      setStats({ bookings: bookings ?? 0, reviews: rs.length, rating: avg });
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vendor_profiles")
      .insert({ user_id: user.id, application_status: "draft" })
      .select("id")
      .single();
    if (error || !data?.id) {
      Alert.alert("Couldn't create listing", error?.message ?? "Unknown error");
      return;
    }
    await loadProfile();
    router.push(`/(vendor)/listing?id=${data.id}` as never);
  }

  const businessInitial =
    identity.business_name?.trim()?.[0]?.toUpperCase() ??
    user?.email?.[0]?.toUpperCase() ??
    "V";

  return (
    <View style={{ flex: 1, backgroundColor: WHITE }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: WHITE }}>
        {/* Top bar: New listing (left) · Share + Settings (right) */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingTop: 4,
            paddingBottom: 4,
          }}
        >
          <IconButton icon="plus" onPress={createNewListing} />
          <View style={{ flex: 1 }} />
          <IconButton icon="share" onPress={shareProfile} />
          <View style={{ width: 10 }} />
          <IconButton icon="menu" onPress={() => setMenuOpen(true)} />
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity header — logo + name + category/location + joined. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 16,
            paddingHorizontal: 18,
            marginTop: 8,
          }}
        >
          <View>
            <Avatar logoUrl={identity.logo_url} initial={businessInitial} />
            {verifiedAt ? (
              <View
                style={{
                  position: "absolute",
                  bottom: -4,
                  right: -4,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: ACCENT,
                  borderWidth: 3,
                  borderColor: WHITE,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="check" size={11} color={WHITE} />
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={2}
              style={{
                fontFamily: SERIF,
                fontStyle: "italic",
                fontWeight: "700",
                fontSize: 28,
                lineHeight: 32,
                letterSpacing: -0.5,
                color: INK,
              }}
            >
              {identity.business_name ?? "Your business"}
            </Text>
            {identity.category || identity.location ? (
              <Text style={{ marginTop: 4, fontSize: 13, color: INK_DIM }}>
                {identity.category ?? ""}
                {identity.category && identity.location ? " · " : ""}
                {identity.location ?? ""}
              </Text>
            ) : null}
            {profileCreatedAt ? (
              <Text style={{ marginTop: 2, fontSize: 12, color: INK_DIM }}>
                {joinedLabel(profileCreatedAt)}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Edit profile action */}
        <View style={{ paddingHorizontal: 18, marginTop: 14 }}>
          <Pressable
            onPress={openEditProfile}
            style={{
              alignSelf: "flex-start",
              backgroundColor: INK,
              borderRadius: 999,
              paddingHorizontal: 18,
              paddingVertical: 11,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Feather name="edit-2" size={14} color={WHITE} />
            <Text style={{ color: WHITE, fontSize: 14, fontWeight: "600", marginLeft: 6 }}>
              Edit profile
            </Text>
          </Pressable>
        </View>

        {/* Bio */}
        <View style={{ paddingHorizontal: 18, marginTop: 16 }}>
          <Text
            style={{
              fontFamily: SERIF,
              fontStyle: "italic",
              color: identity.bio?.trim() ? INK : INK_DIM,
              fontSize: identity.bio?.trim() ? 17 : 16,
              lineHeight: 24,
            }}
          >
            {identity.bio?.trim() ? identity.bio : "Add a short bio from Edit profile."}
          </Text>
        </View>

        {/* Stats row */}
        <View
          style={{
            marginHorizontal: 18,
            marginTop: 22,
            paddingVertical: 16,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: BORDER,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <StatCell value={String(stats.bookings)} label="BOOKINGS" />
          <Divider />
          <StatCell
            value={stats.rating != null ? stats.rating.toFixed(1) : "—"}
            label="RATING"
          />
          <Divider />
          <StatCell value={String(stats.reviews)} label="REVIEWS" />
        </View>

        {/* Listings — the only content surface now. */}
        <View style={{ paddingHorizontal: 18, marginTop: 24 }}>
          <Text
            style={{
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: 22,
              fontWeight: "700",
              color: INK,
            }}
          >
            Your listings
          </Text>
        </View>
        <View style={{ marginTop: 12, paddingHorizontal: 8 }}>
          <ListingTab
            loading={loading}
            listings={listings}
            onEdit={(id) => router.push(`/(vendor)/listing?id=${id}` as never)}
            onCreateNew={createNewListing}
            onChanged={loadProfile}
          />
        </View>
      </ScrollView>

      <SettingsSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        email={user?.email ?? ""}
        onSignOut={signOut}
      />
    </View>
  );
}

function IconButton({
  icon,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      hitSlop={8}
      onPress={onPress}
      style={{
        width: 38,
        height: 38,
        borderRadius: 999,
        backgroundColor: SURFACE,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Feather name={icon} size={18} color={INK} />
    </Pressable>
  );
}

function Avatar({ logoUrl, initial }: { logoUrl: string | null; initial: string }) {
  return (
    <View
      style={{
        width: 96,
        height: 96,
        borderRadius: 20,
        overflow: "hidden",
        backgroundColor: logoUrl ? WHITE : ACCENT,
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
        <Text
          style={{
            color: WHITE,
            fontFamily: SERIF,
            fontStyle: "italic",
            fontWeight: "700",
            fontSize: 44,
          }}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}

function Divider() {
  return <View style={{ width: 1, alignSelf: "stretch", backgroundColor: BORDER }} />;
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 2 }}>
      <Text
        style={{
          color: INK,
          fontFamily: SERIF,
          fontWeight: "700",
          fontSize: 26,
          lineHeight: 30,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          marginTop: 4,
          color: INK_DIM,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1.4,
        }}
      >
        {label}
      </Text>
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
  onEdit,
  onCreateNew,
  onChanged,
}: {
  loading: boolean;
  listings: VendorProfile[];
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
  return (
    <View className="w-full px-4" style={{ gap: 18 }}>
      {listings.map((l) => (
        <ListingCard
          key={l.id}
          listing={l}
          onEdit={() => onEdit(l.id)}
          onChanged={onChanged}
        />
      ))}
      <Pressable onPress={onCreateNew}>
        {({ pressed }) => (
          <View
            style={{
              marginTop: 4,
              paddingVertical: 18,
              borderRadius: 18,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: BORDER,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              opacity: pressed ? 0.7 : 1,
            }}
          >
            <Feather name="plus" size={16} color={INK} />
            <Text className="ml-2 text-sm font-semibold text-foreground">
              Add another listing
            </Text>
          </View>
        )}
      </Pressable>
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

  const isComplete =
    listing.application_status === "approved" &&
    !!listing.location &&
    listing.base_price_cents != null;
  const isPending = listing.application_status === "pending";

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

  // Draft / rejected — full-width row with status + CTA.
  if (!isComplete && !isPending) {
    return (
      <Pressable onPress={onEdit}>
        {({ pressed }) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: WHITE,
              borderRadius: 18,
              padding: 14,
              opacity: pressed ? 0.85 : 1,
              borderWidth: 1,
              borderColor: BORDER,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: SURFACE,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="shopping-bag" size={22} color={INK} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                {listing.business_name ?? "Untitled listing"}
              </Text>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {listing.application_status === "rejected"
                  ? "Rejected — tap to revise"
                  : "Draft — tap to finish setup"}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={INK_DIM} />
          </View>
        )}
      </Pressable>
    );
  }

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
            <CardAction icon="eye-off" onPress={unpublish} disabled={busy} />
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
          {listing.business_name ?? "Vendor"}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-sm text-muted-foreground">
          {listing.category ?? "—"}
          {listing.location ? ` · ${listing.location}` : ""}
        </Text>
        {listing.base_price_cents != null ? (
          <Text className="mt-1 text-sm text-foreground/80">
            From ${Math.round(listing.base_price_cents / 100).toLocaleString()}
          </Text>
        ) : null}
        {isPending ? (
          <View className="mt-3 self-start rounded-full bg-amber-100 px-3 py-1">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
              In review
            </Text>
          </View>
        ) : null}
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
