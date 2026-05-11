// Host Explore — global feed of approved vendor activity. Mirrors
// the vendor-mobile Home tab visually, but read-only: hosts browse
// listings + scroll posts / reels / buzz, no Create surface.
//
// 4 sub-tabs (icons only, top of the screen): Listings (default),
// Posts, Reels, Buzz. Each pulls from the same Supabase tables with
// inner-joined application_status='approved' so unpublished drafts
// stay out of the feed. Listings tab uses the Airbnb-explore layout
// (top-level categories vertical, sub-categories with horizontal
// rails). Tapping any listing card opens the native vendor detail
// screen at /(host)/vendor/[id].

import { useCallback, useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { CATEGORY_GROUPS, groupOfSub } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type ViewKind = "grid" | "reels" | "buzz" | "listing";

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
  hero_url?: string | null;
}

export default function ExploreScreen() {
  const { user } = useAuth();
  const [view, setView] = useState<ViewKind>("grid");
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [buzz, setBuzz] = useState<BuzzRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // Set of saved vendor_ids for this host. Each ListingCard heart reads
  // membership from here and flips it via toggleSave, which mirrors
  // saved_vendors (RLS: auth.uid() = host_id).
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());

  const loadSaved = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("saved_vendors")
      .select("vendor_id")
      .eq("host_id", user.id);
    const next = new Set<string>(
      ((data ?? []) as { vendor_id: string }[]).map((r) => r.vendor_id),
    );
    setSavedIds(next);
  }, [user?.id]);

  const toggleSave = useCallback(
    async (vendorId: string) => {
      if (!user?.id) return;
      const wasSaved = savedIds.has(vendorId);
      // Optimistic.
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(vendorId);
        else next.add(vendorId);
        return next;
      });
      if (wasSaved) {
        const { error } = await supabase
          .from("saved_vendors")
          .delete()
          .eq("host_id", user.id)
          .eq("vendor_id", vendorId);
        if (error) {
          setSavedIds((prev) => new Set(prev).add(vendorId));
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("saved_vendors")
          .upsert(
            { host_id: user.id, vendor_id: vendorId },
            { onConflict: "host_id,vendor_id" },
          );
        if (error) {
          setSavedIds((prev) => {
            const n = new Set(prev);
            n.delete(vendorId);
            return n;
          });
        }
      }
    },
    [user?.id, savedIds],
  );

  const loadFeeds = useCallback(async () => {
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
          // Only show listings that are actually publish-ready —
          // same four fields the listing builder requires. Admin can
          // approve a half-baked row but the marketplace shouldn't
          // surface it until the vendor fills everything in.
          .not("location", "is", null)
          .not("bio", "is", null)
          .not("category", "is", null)
          .gt("base_price_cents", 0)
          .order("created_at", { ascending: false })
          .limit(100),
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

    setPosts((postsRes.data ?? []) as unknown as PostRow[]);
    setReels((reelsRes.data ?? []) as unknown as ReelRow[]);
    setBuzz((buzzRes.data ?? []) as unknown as BuzzRow[]);

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

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 pt-4">
        <Text className="text-2xl font-semibold text-foreground">Explore</Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Listings, posts, reels, and buzz from approved vendors
        </Text>
      </View>

      <View className="mt-12 flex-row border-t border-border">
        <ViewTab
          active={view === "grid"}
          onPress={() => setView("grid")}
          iconName="grid"
        />
        <ViewTab
          active={view === "reels"}
          onPress={() => setView("reels")}
          iconName="play"
        />
        <ViewTab
          active={view === "buzz"}
          onPress={() => setView("buzz")}
          iconName="align-left"
        />
        <ViewTab
          active={view === "listing"}
          onPress={() => setView("listing")}
          iconName="shopping-bag"
        />
      </View>

      <ScrollView contentContainerClassName="pb-32 pt-4">
        {view === "grid" ? (
          posts.length === 0 ? (
            <EmptyMessage body="No vendor posts yet." />
          ) : (
            <PostGrid posts={posts} />
          )
        ) : view === "reels" ? (
          reels.length === 0 ? (
            <EmptyMessage body="No reels yet." />
          ) : (
            <ReelGrid reels={reels} />
          )
        ) : view === "buzz" ? (
          buzz.length === 0 ? (
            <EmptyMessage body="No buzz yet." />
          ) : (
            <BuzzList items={buzz} />
          )
        ) : listings.length === 0 ? (
          <EmptyMessage body="No vendor listings yet." />
        ) : (
          <ListingFeed
            listings={listings}
            category={categoryFilter}
            onCategoryChange={setCategoryFilter}
            savedIds={savedIds}
            onToggleSave={toggleSave}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ViewTab({
  active,
  onPress,
  iconName,
}: {
  active: boolean;
  onPress: () => void;
  iconName: keyof typeof Feather.glyphMap;
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
    </Pressable>
  );
}

function EmptyMessage({ body }: { body: string }) {
  return (
    <View className="items-center pt-16 px-6">
      <Text className="text-sm text-muted-foreground text-center">{body}</Text>
    </View>
  );
}

// IG-style author header — vendor logo + business name above each card.
function FeedAuthorHeader({ vendor }: { vendor: Author }) {
  return (
    <View className="flex-row items-center gap-3 px-3 py-3">
      <View className="h-10 w-10 overflow-hidden rounded-full bg-muted">
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

// Marketplace feed — top-level CATEGORIES stack vertically; each
// section has stacked sub-categories with horizontal rails of cards.
// Top chip row narrows to a single category.
function ListingFeed({
  listings,
  category,
  onCategoryChange,
  savedIds,
  onToggleSave,
}: {
  listings: ListingRow[];
  category: string | null;
  onCategoryChange: (c: string | null) => void;
  savedIds: Set<string>;
  onToggleSave: (vendorId: string) => void;
}) {
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
          const knownSubsForGroup =
            CATEGORY_GROUPS.find((g) => g.name === groupName)?.subs ?? [];
          const orderedSubs = [
            ...knownSubsForGroup.filter((s) => subs.has(s)),
            ...Array.from(subs.keys())
              .filter((s) => !knownSubsForGroup.includes(s))
              .sort(),
          ];
          return (
            <View key={groupName}>
              <View className="px-4 mb-3">
                <Text className="text-lg font-bold text-foreground">
                  {groupName}
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
                          <ListingCard
                            key={l.id}
                            listing={l}
                            saved={savedIds.has(l.id)}
                            onToggleSave={() => onToggleSave(l.id)}
                          />
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

function ListingCard({
  listing,
  saved,
  onToggleSave,
}: {
  listing: ListingRow;
  saved: boolean;
  onToggleSave: () => void;
}) {
  const router = useRouter();
  const price =
    listing.base_price_cents != null
      ? `From $${Math.round(listing.base_price_cents / 100).toLocaleString()}`
      : null;
  return (
    <Pressable
      onPress={() =>
        router.push(`/(host)/vendor/${listing.slug ?? listing.id}` as never)
      }
      className="active:opacity-90"
      style={{ width: Math.round(Dimensions.get("window").width * 0.4) }}
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
        <Pressable
          onPress={(e) => {
            // Don't let the card-level Pressable also fire and route
            // away from the explore feed.
            e.stopPropagation();
            onToggleSave();
          }}
          hitSlop={10}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            shadowColor: "#000",
            shadowOpacity: 0.4,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 1 },
          }}
        >
          <Feather
            name="heart"
            size={22}
            color={saved ? "#dc2626" : "#fff"}
          />
        </Pressable>
      </View>
      <View className="mt-3 px-1">
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
        active ? "bg-foreground" : "border border-border bg-background"
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
