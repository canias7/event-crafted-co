// Home tab — 4-segment content browser. Same data and composers as
// the Profile tab, just a different surface so the vendor can flip
// through their grid / reels / buzz / listings without leaving the
// home position.

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { CATEGORY_GROUPS, groupOfSub } from "@vendora/core";
import type { VendorProfile } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { BuzzComposer } from "@/components/BuzzComposer";
import { MediaComposer, type MediaKind } from "@/components/MediaComposer";
import { PhotoLibraryPicker } from "@/components/PhotoLibraryPicker";

type ViewKind = "grid" | "reels" | "buzz" | "listing";

// Each row now carries the author's vendor card (business_name +
// logo_url) inline because the home feed is global — different
// vendors' posts show side-by-side, so one shared profile prop no
// longer covers it.
type Author = { business_name: string | null; logo_url: string | null } | null;

interface PostRow {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  vendor: Author;
}
interface ReelRow {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  created_at: string;
  vendor: Author;
}
interface BuzzRow {
  id: string;
  body: string;
  created_at: string;
  vendor: Author;
}
interface ListingRow {
  id: string;
  business_name: string | null;
  category: string | null;
  location: string | null;
  base_price_cents: number | null;
  bio: string | null;
  logo_url: string | null;
  slug: string | null;
  // Filled in client-side after the query — most recent vendor_post
  // image_url for this vendor, used as the card hero so the marketplace
  // tile reads as a real photo (Airbnb-style) instead of an empty
  // logo plate. Falls back to logo_url when the vendor has no posts.
  hero_url?: string | null;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [view, setView] = useState<ViewKind>("grid");
  const [buzzOpen, setBuzzOpen] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [reelPickerOpen, setReelPickerOpen] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<
    { asset: ImagePicker.ImagePickerAsset; kind: MediaKind } | null
  >(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [buzz, setBuzz] = useState<BuzzRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  // Category filter chip on the marketplace tab. null = "all".
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select(
          "id, business_name, location, base_price_cents, application_status, logo_url",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setProfile(data as VendorProfile | null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadFeeds = useCallback(async () => {
    // Home is the global feed — every approved vendor's content,
    // newest first. Inner-joined against vendor_profiles + filtered
    // to application_status='approved' so unpublished drafts and
    // rejected listings don't leak into the feed. The vendor's
    // logo + business name come back inline for the IG-style author
    // header on each card.
    const [postsRes, reelsRes, buzzRes, listingsRes, portfolioRes] =
      await Promise.all([
        supabase
          .from("vendor_posts")
          .select(
            "id, image_url, caption, created_at, vendor_id, vendor:vendor_profiles!inner(business_name, logo_url, application_status)",
          )
          .eq("vendor.application_status", "approved")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("vendor_reels")
          .select(
            "id, video_url, thumbnail_url, caption, created_at, vendor:vendor_profiles!inner(business_name, logo_url, application_status)",
          )
          .eq("vendor.application_status", "approved")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("vendor_buzz")
          .select(
            "id, body, created_at, vendor:vendor_profiles!inner(business_name, logo_url, application_status)",
          )
          .eq("vendor.application_status", "approved")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("vendor_profiles")
          .select(
            "id, business_name, category, location, base_price_cents, bio, logo_url, slug",
          )
          .eq("application_status", "approved")
          .order("created_at", { ascending: false })
          .limit(100),
        // Listing portfolio photos — the actual photos a vendor
        // uploaded to their listing (Studio → Photo Gallery →
        // PortfolioUploader → vendor_portfolio_images). Ordered by
        // display_order so the first hit per vendor is what they
        // intended as the lead image.
        supabase
          .from("vendor_portfolio_images")
          .select(
            "vendor_id, storage_path, display_order, vendor:vendor_profiles!inner(application_status)",
          )
          .eq("vendor.application_status", "approved")
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(500),
      ]);
    // The auto-generated supabase TS types treat the FK embed as
    // an array, but the runtime shape (many-to-one FK) is a single
    // object. Cast through unknown to bridge the types without
    // restructuring at runtime.
    setPosts((postsRes.data ?? []) as unknown as PostRow[]);
    setReels((reelsRes.data ?? []) as unknown as ReelRow[]);
    setBuzz((buzzRes.data ?? []) as unknown as BuzzRow[]);

    // Hero image source is strictly the listing's own portfolio
    // photos (vendor_portfolio_images). Posts, reels, buzz, and
    // logo never appear on the marketplace card — the listing
    // shows what the vendor put into the listing, nothing else.
    // Empty hero → the card renders a neutral placeholder.
    type RawPortfolio = { vendor_id: string; storage_path: string };
    const heroByVendor = new Map<string, string>();
    for (const row of (portfolioRes.data ?? []) as unknown as RawPortfolio[]) {
      if (!heroByVendor.has(row.vendor_id) && row.storage_path) {
        const { data: pub } = supabase.storage
          .from("vendor-portfolios")
          .getPublicUrl(row.storage_path);
        if (pub.publicUrl) heroByVendor.set(row.vendor_id, pub.publicUrl);
      }
    }
    const enriched = ((listingsRes.data ?? []) as ListingRow[]).map((l) => ({
      ...l,
      hero_url: heroByVendor.get(l.id) ?? null,
    }));
    setListings(enriched);
  }, []);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  // Home tab listings count = global count of approved vendors in
  // the marketplace, not just whether the current user has one.
  const listingsCount = listings.length;

  function openCreatePost() {
    setPhotoPickerOpen(true);
  }

  function openCreateReel() {
    setReelPickerOpen(true);
  }

  async function pickMedia(
    src: "camera" | "library",
    kind: "Images" | "Videos",
  ) {
    const mediaTypes =
      kind === "Videos"
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.Images;
    const noun = kind === "Videos" ? "video" : "photo";
    const composerKind: MediaKind = kind === "Videos" ? "video" : "photo";

    if (src === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Camera access needed",
          `Enable camera access in Settings to capture a ${noun}.`,
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes,
        quality: 0.85,
        videoMaxDuration: 60,
      });
      if (!result.canceled && result.assets[0]) {
        setPendingMedia({ asset: result.assets[0], kind: composerKind });
      }
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Library access needed",
        `Enable photo library access in Settings to pick a ${noun}.`,
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingMedia({ asset: result.assets[0], kind: composerKind });
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 pt-4">
        <Text className="text-2xl font-semibold text-foreground">Home</Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Your posts, reels, and listings
        </Text>
      </View>

      <View className="mt-12 flex-row border-t border-border">
        <ViewTab
          active={view === "grid"}
          onPress={() => setView("grid")}
          iconName="grid"
          count={posts.length}
        />
        <ViewTab
          active={view === "reels"}
          onPress={() => setView("reels")}
          iconName="play"
          count={reels.length}
        />
        <ViewTab
          active={view === "buzz"}
          onPress={() => setView("buzz")}
          iconName="align-left"
          count={buzz.length}
        />
        <ViewTab
          active={view === "listing"}
          onPress={() => setView("listing")}
          iconName="shopping-bag"
          count={listingsCount}
        />
      </View>

      <ScrollView contentContainerClassName="pb-32 pt-4">
        {view === "grid" ? (
          posts.length === 0 ? (
            <View className="items-center px-6 pt-10">
              <EmptyState
                icon="grid"
                title="No posts yet"
                body="Share photos from past events to build trust with hosts."
                ctaLabel="Create"
                onCta={openCreatePost}
              />
            </View>
          ) : (
            <PostGrid posts={posts} />
          )
        ) : view === "reels" ? (
          reels.length === 0 ? (
            <View className="items-center px-6 pt-10">
              <EmptyState
                icon="play"
                title="No reels yet"
                body="Short videos help your listing convert."
                ctaLabel="Create"
                onCta={openCreateReel}
              />
            </View>
          ) : (
            <ReelGrid reels={reels} />
          )
        ) : view === "buzz" ? (
          buzz.length === 0 ? (
            <View className="items-center px-6 pt-10">
              <EmptyState
                icon="align-left"
                title="No buzz yet"
                body="Post quick updates, behind-the-scenes notes, or news for your followers."
                ctaLabel="Create"
                onCta={() => setBuzzOpen(true)}
              />
            </View>
          ) : (
            <BuzzList items={buzz} />
          )
        ) : (
          listingsCount === 0 ? (
            <View className="items-center px-6 pt-10">
              <EmptyState
                icon="shopping-bag"
                title="No listings yet"
                body="The marketplace is empty right now — listings populate the feed once vendors get approved."
              />
            </View>
          ) : (
            <ListingFeed
              listings={listings}
              category={categoryFilter}
              onCategoryChange={setCategoryFilter}
            />
          )
        )}
      </ScrollView>

      <BuzzComposer
        visible={buzzOpen}
        userId={user?.id ?? null}
        vendorId={profile?.id ?? null}
        onClose={() => setBuzzOpen(false)}
        onPosted={loadFeeds}
      />

      <MediaComposer
        visible={pendingMedia !== null}
        kind={pendingMedia?.kind ?? "photo"}
        asset={pendingMedia?.asset ?? null}
        userId={user?.id ?? null}
        vendorId={profile?.id ?? null}
        onClose={() => setPendingMedia(null)}
        onPosted={loadFeeds}
      />

      <PhotoLibraryPicker
        visible={photoPickerOpen}
        mediaType="photo"
        onClose={() => setPhotoPickerOpen(false)}
        onPicked={(picked) => {
          setPhotoPickerOpen(false);
          setPendingMedia({
            asset: {
              uri: picked.uri,
              width: picked.width ?? 0,
              height: picked.height ?? 0,
              type: "image",
              mimeType: picked.type ?? "image/jpeg",
            } as unknown as ImagePicker.ImagePickerAsset,
            kind: "photo",
          });
        }}
      />

      <PhotoLibraryPicker
        visible={reelPickerOpen}
        mediaType="video"
        onClose={() => setReelPickerOpen(false)}
        onPicked={(picked) => {
          setReelPickerOpen(false);
          setPendingMedia({
            asset: {
              uri: picked.uri,
              width: picked.width ?? 0,
              height: picked.height ?? 0,
              type: "video",
              duration: picked.duration ?? null,
              mimeType: picked.type ?? "video/mp4",
            } as unknown as ImagePicker.ImagePickerAsset,
            kind: "video",
          });
        }}
      />
    </SafeAreaView>
  );
}

function ViewTab({
  active,
  onPress,
  iconName,
  count,
}: {
  active: boolean;
  onPress: () => void;
  iconName: keyof typeof Feather.glyphMap;
  count: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center justify-center py-3 active:opacity-60"
      style={{
        backgroundColor: active ? "#ffffff" : "transparent",
        borderRadius: active ? 14 : 0,
        borderWidth: active ? 1 : 0,
        borderColor: "#e5e5e5",
        marginHorizontal: active ? 4 : 0,
        marginVertical: active ? 4 : 0,
        ...(active
          ? {
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }
          : null),
      }}
    >
      <Feather name={iconName} size={22} color={active ? "#0a0a0a" : "#737373"} />
      <Text
        className="mt-1 text-sm font-semibold"
        style={{ color: active ? "#0a0a0a" : "#737373" }}
      >
        {count}
      </Text>
    </Pressable>
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
        <Feather name={icon} size={24} color="#737373" />
      </View>
      <Text className="mt-4 text-lg font-semibold text-foreground">{title}</Text>
      <Text className="mt-1 text-center text-base text-muted-foreground">
        {body}
      </Text>
      {ctaLabel && onCta ? (
        <Pressable
          onPress={onCta}
          className="mt-5 rounded-full bg-foreground px-6 py-2.5 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-background">
            {ctaLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Instagram-style vertical feed. Each post / reel takes the full
// screen width with a 1:1 aspect on posts and 4:5 on reels (taller,
// reads as video). The outer ScrollView handles vertical scroll, so
// these stay scrollEnabled={false} on the inner list to avoid nested
// scroll fights.

// IG-style author header that floats above each feed card. Shows the
// vendor's uploaded logo (or the local fallback icon) on the left and
// their business name next to it. Pulls from vendor_profiles.logo_url
// so the avatar matches whatever the vendor uploaded on the web.
function FeedAuthorHeader({ vendor }: { vendor: Author }) {
  return (
    <View className="flex-row items-center gap-3 px-3 py-3">
      <View className="h-10 w-10 overflow-hidden rounded-full bg-secondary/60">
        <Image
          source={
            vendor?.logo_url
              ? { uri: vendor.logo_url }
              : require("../../assets/icon.png")
          }
          className="h-full w-full"
          resizeMode="cover"
        />
      </View>
      <Text
        numberOfLines={1}
        className="flex-1 text-base font-semibold text-foreground"
      >
        {vendor?.business_name ?? "Vendora"}
      </Text>
    </View>
  );
}

function PostGrid({ posts }: { posts: PostRow[] }) {
  return (
    <View className="gap-4">
      {posts.map((p) => (
        <View key={p.id} className="px-4">
          <View
            style={{
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: "#ffffff",
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 3,
            }}
          >
            {/* Author header sits at the top of the card so the post
                reads as a self-contained unit, IG-style. */}
            <View className="bg-background">
              <FeedAuthorHeader vendor={p.vendor} />
            </View>
            <Image
              source={{ uri: p.image_url }}
              style={{ width: "100%", aspectRatio: 4 / 5 }}
              resizeMode="cover"
            />
            {p.caption ? (
              <View className="px-4 py-3 bg-background">
                <Text className="text-sm text-foreground">{p.caption}</Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleString()}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function ReelGrid({ reels }: { reels: ReelRow[] }) {
  return (
    <View className="gap-4">
      {reels.map((r) => (
        <View key={r.id} className="px-4">
          <View
            style={{
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: "#ffffff",
              shadowColor: "#000",
              shadowOpacity: 0.12,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 3,
            }}
          >
            <View className="bg-background">
              <FeedAuthorHeader vendor={r.vendor} />
            </View>
            <View
              style={{
                aspectRatio: 4 / 5,
                width: "100%",
                backgroundColor: "#1a1a1a",
              }}
            >
              {r.thumbnail_url ? (
                <Image
                  source={{ uri: r.thumbnail_url }}
                  style={{ flex: 1 }}
                  resizeMode="cover"
                />
              ) : null}
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: r.thumbnail_url
                    ? "rgba(0,0,0,0.22)"
                    : "transparent",
                }}
              >
                <Feather name="play" size={48} color="#fff" />
              </View>
            </View>
            {r.caption ? (
              <View className="px-4 py-3 bg-background">
                <Text className="text-sm text-foreground">{r.caption}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

// Marketplace feed — Airbnb-explore style.
//
// Vertical scroll moves between top-level CATEGORIES (the groups in
// CATEGORY_GROUPS: Venues, Food & Beverage, Entertainment, …). Inside
// each category section the SUB-categories are stacked, each with its
// own horizontal-scroll rail of vendor cards. Chip row at the top is a
// quick jump filter — tapping a chip narrows to a single category.
function ListingFeed({
  listings,
  category,
  onCategoryChange,
}: {
  listings: ListingRow[];
  /** Selected top-level group name, or null for "All". */
  category: string | null;
  onCategoryChange: (c: string | null) => void;
}) {
  // Two-level group: top-level category → sub-category → listings.
  const byGroup = new Map<string, Map<string, ListingRow[]>>();
  for (const l of listings) {
    const sub =
      l.category && l.category.trim().length > 0 ? l.category : "Other";
    const group = groupOfSub(sub) ?? "Other";
    let subs = byGroup.get(group);
    if (!subs) {
      subs = new Map<string, ListingRow[]>();
      byGroup.set(group, subs);
    }
    const arr = subs.get(sub);
    if (arr) arr.push(l);
    else subs.set(sub, [l]);
  }

  // Order groups in the canonical taxonomy order, then any "Other"
  // / unknown groups alphabetically at the end.
  const taxonomyOrder = CATEGORY_GROUPS.map((g) => g.name);
  const knownGroups = taxonomyOrder.filter((n) => byGroup.has(n));
  const otherGroups = Array.from(byGroup.keys())
    .filter((n) => !taxonomyOrder.includes(n))
    .sort();
  const orderedGroups = [...knownGroups, ...otherGroups];
  const visibleGroups =
    category == null
      ? orderedGroups
      : orderedGroups.filter((g) => g === category);

  return (
    <View>
      {/* Top-level category chip row — quick jump / filter. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4 gap-2 pb-4"
      >
        <CategoryChip
          label="All"
          active={category == null}
          onPress={() => onCategoryChange(null)}
        />
        {orderedGroups.map((g) => (
          <CategoryChip
            key={g}
            label={g}
            active={category === g}
            onPress={() => onCategoryChange(g)}
          />
        ))}
      </ScrollView>

      <View className="gap-10">
        {visibleGroups.map((groupName) => {
          const subs = byGroup.get(groupName);
          if (!subs) return null;
          // Order subs by their position in the canonical taxonomy,
          // then any unknown subs alphabetically.
          const knownSubsForGroup =
            CATEGORY_GROUPS.find((g) => g.name === groupName)?.subs ?? [];
          const orderedSubs = [
            ...knownSubsForGroup.filter((s) => subs.has(s)),
            ...Array.from(subs.keys())
              .filter((s) => !knownSubsForGroup.includes(s))
              .sort(),
          ];
          const total = Array.from(subs.values()).reduce(
            (acc, rows) => acc + rows.length,
            0,
          );
          return (
            <View key={groupName}>
              <View className="px-4 mb-3 flex-row items-end justify-between">
                <Text className="text-lg font-bold text-foreground">
                  {groupName}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {total} listing{total === 1 ? "" : "s"}
                </Text>
              </View>
              <View className="gap-5">
                {orderedSubs.map((subName) => {
                  const rows = subs.get(subName) ?? [];
                  if (rows.length === 0) return null;
                  return (
                    <View key={subName}>
                      <Text className="px-4 mb-2 text-sm font-semibold text-muted-foreground">
                        {subName}
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerClassName="px-4 gap-3"
                      >
                        {rows.map((l) => (
                          <ListingCard key={l.id} listing={l} />
                        ))}
                      </ScrollView>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
        {visibleGroups.length === 0 ? (
          <View className="items-center pt-10 px-4">
            <Text className="text-sm text-muted-foreground">
              No listings in this category yet.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// One vendor card. Sized for the horizontal rail (~70% of screen
// width feels right on phones — keeps the next card hinted on the
// right edge so the rail reads as scrollable).
function ListingCard({ listing }: { listing: ListingRow }) {
  const price =
    listing.base_price_cents != null
      ? `From $${Math.round(listing.base_price_cents / 100).toLocaleString()}`
      : null;
  const href = listing.slug
    ? `https://eventvendora.com/vendors/${listing.slug}`
    : `https://eventvendora.com/vendors/${listing.id}`;
  return (
    <Pressable
      onPress={() => Linking.openURL(href)}
      className="active:opacity-90"
      style={{ width: Math.round(Dimensions.get("window").width * 0.8) }}
    >
      <View
        style={{
          borderRadius: 18,
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
          aspectRatio: 1,
          width: "100%",
        }}
      >
        {listing.hero_url ? (
          <Image
            source={{ uri: listing.hero_url }}
            style={{ flex: 1 }}
            resizeMode="cover"
          />
        ) : (
          // No portfolio photo on the listing itself → render a
          // neutral placeholder. We intentionally don't borrow a
          // post / reel / logo image; the card only ever shows what
          // the vendor put into the listing.
          <View
            className="flex-1 items-center justify-center px-6"
            style={{ backgroundColor: "#f4f4f5" }}
          >
            <Feather name="image" size={28} color="#a1a1aa" />
            <Text className="mt-2 text-center text-xs text-muted-foreground">
              No listing photos yet
            </Text>
          </View>
        )}
        {/* White stroked heart with drop shadow — Airbnb's wishlist
            pin style. Relies on the shadow to stay legible over busy
            photos so we don't need a pill backdrop. */}
        <View
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            shadowColor: "#000",
            shadowOpacity: 0.4,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 1 },
          }}
        >
          <Feather name="heart" size={26} color="#fff" />
        </View>
      </View>
      <View className="mt-3">
        <Text
          numberOfLines={1}
          className="text-base font-semibold text-foreground"
        >
          {listing.business_name ?? "Vendor"}
        </Text>
        <Text
          numberOfLines={1}
          className="mt-0.5 text-sm text-muted-foreground"
        >
          {listing.location ?? "Marketplace listing"}
        </Text>
        {price ? (
          <Text className="mt-1 text-sm text-foreground/80">{price}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function CategoryChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-4 py-2 active:opacity-70 ${
        active
          ? "bg-foreground"
          : "border border-border bg-background"
      }`}
    >
      <Text
        className={`text-xs font-semibold ${
          active ? "text-background" : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function BuzzList({ items }: { items: BuzzRow[] }) {
  return (
    <View className="gap-3 px-4">
      {items.map((b) => (
        <View
          key={b.id}
          className="rounded-xl border border-border bg-background p-2"
        >
          <FeedAuthorHeader vendor={b.vendor} />
          <Text className="px-3 pb-3 text-base text-foreground">{b.body}</Text>
          <Text className="px-3 pb-3 text-xs text-muted-foreground">
            {new Date(b.created_at).toLocaleString()}
          </Text>
        </View>
      ))}
    </View>
  );
}
