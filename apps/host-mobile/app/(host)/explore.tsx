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
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { CATEGORY_GROUPS, groupOfSub } from "@vendora/core";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useCategoryNames } from "@/lib/categoryNames";
import { Wordmark } from "@/components/Wordmark";
import { supabase } from "@/lib/supabase";
import { C, IS_DARK } from "@/lib/theme";

// Grey icons (idle view tabs): warm grey on light, lighter on dark.
const ICON_DIM = IS_DARK ? C.placeholder : "#6f6a60";

const SERIF = "LibreBaskerville";
const SERIF_BOLD = "LibreBaskerville-Bold";
const SERIF_ITALIC = "LibreBaskerville-Italic";

// Page title — one treatment across both apps. Vendor sets every
// screen heading at 38/44 with a -0.5 tracking correction; host had
// drifted to three different sizes and two families.
const PAGE_TITLE = {
  fontFamily: SERIF_BOLD,
  fontSize: 38,
  lineHeight: 44,
  letterSpacing: -0.5,
  color: C.text,
  marginTop: 8,
} as const;

type ViewKind = "grid" | "reels" | "buzz" | "listing";

type TFn = (key: string, vars?: Record<string, string | number | null | undefined>) => string;

// Money keeps the US format in every language ($1,234).
function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

// Same rules as formatListingPrice in @vendora/core, in the app's language.
function listingPrice(
  minCents: number | null | undefined,
  maxCents: number | null | undefined,
  t: TFn,
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

function pricingModelsText(models: string[] | null | undefined, t: TFn): string {
  if (!models || models.length === 0) return "";
  return models
    .map((m) => {
      const label = t(`pricingModels.${m}`);
      return label === `explore.pricingModels.${m}` ? m : label;
    })
    .join(" · ");
}

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
  pricing_models: string[] | null;
  price_min_cents: number | null;
  price_max_cents: number | null;
  custom_pricing: boolean | null;
  bio: string | null;
  logo_url: string | null;
  slug: string | null;
  hero_url?: string | null;
}

export default function ExploreScreen() {
  const { t } = useT("explore");
  const { user } = useAuth();
  // Listings is the landing tab: it is the only view with content today
  // (vendor_posts and vendor_reels are both empty), so defaulting to the
  // photo grid meant every new host opened the app onto "No vendor posts
  // yet." The rail is ordered to match, listings first.
  const [view, setView] = useState<ViewKind>("listing");
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
          .is("vendor.paused_at", null)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("vendor_reels")
          .select(
            "id, video_url, thumbnail_url, caption, created_at, vendor:vendor_profiles!inner(business_name, logo_url, application_status)",
          )
          .eq("vendor.application_status", "approved")
          .is("vendor.paused_at", null)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("vendor_buzz")
          .select(
            "id, body, created_at, vendor:vendor_profiles!inner(business_name, logo_url, application_status)",
          )
          .eq("vendor.application_status", "approved")
          .is("vendor.paused_at", null)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("vendor_profiles")
          .select(
            "id, business_name, category, location, base_price_cents, pricing_models, price_min_cents, price_max_cents, custom_pricing, bio, logo_url, slug",
          )
          .eq("application_status", "approved")
          .is("paused_at", null)
          // Only show listings that are actually publish-ready —
          // same four fields the listing builder requires. Admin can
          // approve a half-baked row but the marketplace shouldn't
          // surface it until the vendor fills everything in.
          .not("location", "is", null)
          .not("bio", "is", null)
          .not("category", "is", null)
          .or("price_min_cents.gt.0,custom_pricing.eq.true")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("vendor_portfolio_images")
          .select(
            "vendor_id, storage_path, display_order, vendor:vendor_profiles!inner(application_status)",
          )
          .eq("vendor.application_status", "approved")
          .is("vendor.paused_at", null)
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

  // Pull-to-refresh state. onRefresh re-runs loadFeeds so all four
  // sub-tabs (posts / reels / buzz / listings) get fresh data.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadFeeds();
    } finally {
      setRefreshing(false);
    }
  }, [loadFeeds]);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.page }} edges={["top"]}>
      <View className="px-5 pt-4 pb-4">
        <Wordmark />
        <Text style={PAGE_TITLE}>{t("title")}</Text>
        <Text style={{ fontFamily: SERIF, color: C.textDim }} className="mt-1 text-sm">
          {t("subtitle")}
        </Text>
      </View>

      <View className="flex-row border-t" style={{ borderColor: C.border }}>
        <ViewTab
          active={view === "listing"}
          onPress={() => setView("listing")}
          label={t("tabs.listing")}
          iconName="shopping-bag"
        />
        <ViewTab
          active={view === "grid"}
          onPress={() => setView("grid")}
          label={t("tabs.grid")}
          iconName="grid"
        />
        <ViewTab
          active={view === "reels"}
          onPress={() => setView("reels")}
          label={t("tabs.reels")}
          iconName="play"
        />
        <ViewTab
          active={view === "buzz"}
          onPress={() => setView("buzz")}
          label={t("tabs.buzz")}
          iconName="align-left"
        />
      </View>

      <ScrollView
        contentContainerClassName="pb-32 pt-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {view === "grid" ? (
          posts.length === 0 ? (
            <EmptyMessage body={t("empty.posts")} />
          ) : (
            <PostGrid posts={posts} />
          )
        ) : view === "reels" ? (
          reels.length === 0 ? (
            <EmptyMessage body={t("empty.reels")} />
          ) : (
            <ReelGrid reels={reels} />
          )
        ) : view === "buzz" ? (
          buzz.length === 0 ? (
            <EmptyMessage body={t("empty.buzz")} />
          ) : (
            <BuzzList items={buzz} />
          )
        ) : listings.length === 0 ? (
          <EmptyMessage body={t("empty.listings")} />
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
  label,
}: {
  active: boolean;
  onPress: () => void;
  iconName: keyof typeof Feather.glyphMap;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      className="flex-1 items-center justify-center py-3 active:opacity-60"
      style={{
        // Selected tile: card cream with a 1px ink border — selection
        // reads in ink, and tiles carry no shadow.
        backgroundColor: active ? C.card : "transparent",
        borderRadius: active ? 12 : 0,
        borderWidth: active ? 1 : 0,
        borderColor: C.selected,
        marginHorizontal: active ? 4 : 0,
        marginVertical: active ? 4 : 0,
      }}
    >
      <Feather name={iconName} size={22} color={active ? C.text : ICON_DIM} />
    </Pressable>
  );
}

function EmptyMessage({ body }: { body: string }) {
  return (
    <View className="items-center pt-16 px-6">
      <Text style={{ fontFamily: SERIF, color: C.textDim }} className="text-sm text-center">{body}</Text>
    </View>
  );
}

// IG-style author header — vendor logo + business name above each card.
function FeedAuthorHeader({ vendor }: { vendor: Author }) {
  return (
    <View className="flex-row items-center gap-3 px-3 py-3">
      <View className="h-10 w-10 overflow-hidden rounded-full" style={{ backgroundColor: C.surface }}>
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
      <Text style={{ fontFamily: SERIF_BOLD, color: C.text }}
        numberOfLines={1}
        className="flex-1 text-base"
      >
        {vendor?.business_name ?? "Vendora"}
      </Text>
    </View>
  );
}

function PostGrid({ posts }: { posts: PostRow[] }) {
  const { locale } = useT("explore");
  return (
    <View className="gap-3">
      {posts.map((p) => (
        <View key={p.id} className="px-5">
          <View
            style={{
              borderRadius: 20,
              overflow: "hidden",
              backgroundColor: C.card,
              borderWidth: 1,
              borderColor: C.border,
            }}
          >
            <View>
              <FeedAuthorHeader vendor={p.vendor} />
            </View>
            <Image
              source={{ uri: p.image_url }}
              style={{ width: "100%", aspectRatio: 4 / 5 }}
              resizeMode="cover"
            />
            {p.caption ? (
              <View className="px-4 py-3">
                <Text style={{ fontFamily: SERIF, color: C.text }} className="text-sm">{p.caption}</Text>
                <Text style={{ fontFamily: SERIF, color: C.textDim }} className="mt-1 text-xs">
                  {new Date(p.created_at).toLocaleString(locale)}
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
    <View className="gap-3">
      {reels.map((r) => (
        <View key={r.id} className="px-5">
          <View
            style={{
              borderRadius: 20,
              overflow: "hidden",
              backgroundColor: C.card,
              borderWidth: 1,
              borderColor: C.border,
            }}
          >
            <View>
              <FeedAuthorHeader vendor={r.vendor} />
            </View>
            <View
              style={{
                aspectRatio: 4 / 5,
                width: "100%",
                backgroundColor: "#14161a",
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
              <View className="px-4 py-3">
                <Text style={{ fontFamily: SERIF, color: C.text }} className="text-sm">{r.caption}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function BuzzList({ items }: { items: BuzzRow[] }) {
  const { locale } = useT("explore");
  return (
    <View className="gap-3 px-5">
      {items.map((b) => (
        // Card: p-1 plus the rows' own 12px inset = the standard 16.
        <View
          key={b.id}
          className="rounded-[20px] border p-1" style={{ borderColor: C.border, backgroundColor: C.card }}
        >
          <FeedAuthorHeader vendor={b.vendor} />
          <Text style={{ fontFamily: SERIF, color: C.text }} className="px-3 pb-3 text-base">{b.body}</Text>
          <Text style={{ fontFamily: SERIF, color: C.textDim }} className="px-3 pb-3 text-xs">
            {new Date(b.created_at).toLocaleString(locale)}
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
  const { t } = useT("explore");
  const cat = useCategoryNames();
  // Groups and subs are keyed by their stored English names; only the
  // label shown is translated.
  const groupLabel = (name: string) => {
    if (name === "Other") return t("other");
    const slug = CATEGORY_GROUPS.find((g) => g.name === name)?.slug;
    return slug ? cat.group(slug, name) : name;
  };
  const subLabel = (name: string) => (name === "Other" ? t("other") : cat.sub(name));
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
        contentContainerClassName="px-5 gap-2 pb-4"
      >
        <CategoryChip
          label={t("all")}
          active={category == null}
          onPress={() => onCategoryChange(null)}
        />
        {orderedGroups.map((g) => (
          <CategoryChip
            key={g}
            label={groupLabel(g)}
            active={category === g}
            onPress={() => onCategoryChange(g)}
          />
        ))}
      </ScrollView>

      <View className="gap-8">
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
              <View className="px-5 mb-3">
                <Text style={{ fontFamily: SERIF_BOLD, color: C.text }} className="text-lg">
                  {groupLabel(groupName)}
                </Text>
              </View>
              <View className="gap-5">
                {orderedSubs.map((subName) => {
                  const rows = subs.get(subName) ?? [];
                  if (rows.length === 0) return null;
                  return (
                    <View key={subName}>
                      <Text style={{ fontFamily: SERIF_BOLD, color: C.textDim }} className="px-5 mb-2 text-sm">
                        {subLabel(subName)}
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerClassName="px-5 gap-3"
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
          <View className="items-center pt-10 px-5">
            <Text style={{ fontFamily: SERIF, color: C.textDim }} className="text-sm">
              {t("empty.category")}
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
  const { t } = useT("explore");
  const price =
    listingPrice(listing.price_min_cents, listing.price_max_cents, t) ||
    null;
  const models = pricingModelsText(listing.pricing_models, t);
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
          borderRadius: 20,
          overflow: "hidden",
          backgroundColor: "#14161a",
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
            style={{ backgroundColor: C.surface }}
          >
            <Feather name="image" size={28} color="#a89b8a" />
            <Text style={{ fontFamily: SERIF, color: C.textDim }} className="mt-2 text-center text-xs">
              {t("noPhotos")}
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
          accessibilityRole="button"
          accessibilityLabel={saved ? t("unsave") : t("save")}
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
            color={saved ? "#c9a86a" : "#fff"}
          />
        </Pressable>
      </View>
      <View className="mt-3 px-1">
        <Text style={{ fontFamily: SERIF_BOLD, color: C.text }}
          numberOfLines={1}
          className="text-base"
        >
          {listing.business_name ?? t("vendorFallback")}
        </Text>
        <Text style={{ fontFamily: SERIF, color: C.textDim }}
          numberOfLines={1}
          className="mt-0.5 text-sm"
        >
          {listing.location ?? t("locationFallback")}
        </Text>
        {price ? (
          <Text style={{ fontFamily: SERIF, color: C.text }} className="mt-1 text-sm">{price}</Text>
        ) : null}
        {models ? (
          <Text style={{ fontFamily: SERIF, color: C.textDim }}
            numberOfLines={1}
            className="mt-0.5 text-xs"
          >
            {models}
          </Text>
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
        active ? "" : "border"
      }`}
      style={
        active
          ? { backgroundColor: C.selected }
          : { backgroundColor: C.page, borderColor: C.border }
      }
    >
      <Text
        style={{ fontFamily: SERIF_BOLD, color: active ? C.onSelected : C.text }}
        className="text-xs"
      >
        {label}
      </Text>
    </Pressable>
  );
}
