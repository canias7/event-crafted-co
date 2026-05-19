// Public Explore — the same global feed of approved vendor activity
// that hosts see at /customer/explore, but read-only and stripped of
// any auth-required affordances. No save heart, no dashboard sidebar,
// no NotificationBell. Lives at /explore so anyone (signed-in or not)
// can browse listings, posts, reels, and buzz.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Film, Grid3x3, MessageCircle, Store } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_GROUPS, groupOfSub } from "@/data/categoryTaxonomy";
import { supabase } from "@/integrations/supabase/client";

type Tab = "listing" | "grid" | "reels" | "buzz";

type Author = { business_name: string | null; logo_url: string | null };

interface PostRow {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  vendor: Author | null;
}
interface ReelRow {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  created_at: string;
  vendor: Author | null;
}
interface BuzzRow {
  id: string;
  body: string;
  created_at: string;
  vendor: Author | null;
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

const TABS: Array<{ id: Tab; label: string; icon: typeof Store }> = [
  { id: "listing", label: "Listings", icon: Store },
  { id: "grid", label: "Posts", icon: Grid3x3 },
  { id: "reels", label: "Reels", icon: Film },
  { id: "buzz", label: "Buzz", icon: MessageCircle },
];

export default function PublicExplorePage() {
  const [tab, setTab] = useState<Tab>("listing");
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [buzz, setBuzz] = useState<BuzzRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [category, setCategory] = useState<string | null>(null);

  const loadFeeds = useCallback(async () => {
    setLoading(true);
    const [postsRes, reelsRes, buzzRes, listingsRes, portfolioRes] =
      await Promise.all([
        supabase
          .from("vendor_posts")
          .select(
            "id, image_url, caption, created_at, vendor:vendor_brands!vendor_posts_user_id_profiles_fkey!inner(business_name, logo_url)",
          )
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("vendor_reels")
          .select(
            "id, video_url, thumbnail_url, caption, created_at, vendor:vendor_brands!vendor_reels_user_id_profiles_fkey!inner(business_name, logo_url)",
          )
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("vendor_buzz")
          .select(
            "id, body, created_at, vendor:vendor_brands!vendor_buzz_user_id_profiles_fkey!inner(business_name, logo_url)",
          )
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("vendor_profiles")
          .select(
            "id, business_name, category, location, base_price_cents, bio, logo_url, slug",
          )
          .eq("application_status", "approved")
          .not("location", "is", null)
          .not("category", "is", null)
          .gt("base_price_cents", 0)
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("vendor_portfolio_images")
          .select(
            "vendor_id, storage_path, display_order, vendor:vendor_profiles!inner(application_status)",
          )
          .eq("vendor.application_status", "approved")
          .order("display_order", { ascending: true })
          .limit(300),
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
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  return (
    <div className="min-h-screen public-canvas">
      <PublicNav />
      <main id="main-content" className="pb-20">
        <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="font-editorial text-4xl">Explore</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse approved vendors, posts, reels, and buzz from the
              Vendora community.
            </p>
          </div>
          <div className="flex gap-1 overflow-x-auto scrollbar-hide mb-6">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-foreground text-background"
                      : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {loading ? (
            <LoadingGrid />
          ) : tab === "listing" ? (
            <ListingsFeed
              listings={listings}
              category={category}
              onCategoryChange={setCategory}
            />
          ) : tab === "grid" ? (
            <PostsFeed posts={posts} />
          ) : tab === "reels" ? (
            <ReelsFeed reels={reels} />
          ) : (
            <BuzzFeed buzz={buzz} />
          )}
        </div>
      </main>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-72 w-full rounded-xl" />
      ))}
    </div>
  );
}

function ListingsFeed({
  listings,
  category,
  onCategoryChange,
}: {
  listings: ListingRow[];
  category: string | null;
  onCategoryChange: (c: string | null) => void;
}) {
  if (listings.length === 0) {
    return <EmptyMsg msg="No listings yet — check back soon." />;
  }
  const byGroup = new Map<string, Map<string, ListingRow[]>>();
  for (const l of listings) {
    const sub =
      l.category && l.category.trim().length > 0 ? l.category : "Other";
    const group = groupOfSub(sub) ?? "Other";
    let subs = byGroup.get(group);
    if (!subs) {
      subs = new Map();
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
    <div className="space-y-10">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
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
      </div>

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
          <div key={groupName}>
            <h2 className="font-editorial text-2xl mb-4">{groupName}</h2>
            <div className="space-y-6">
              {orderedSubs.map((subName) => {
                const rows = subs.get(subName) ?? [];
                if (rows.length === 0) return null;
                return (
                  <div key={subName}>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                      {subName}
                    </h3>
                    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                      {rows.map((l) => (
                        <ListingCard key={l.id} listing={l} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
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
    <button
      onClick={onPress}
      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-foreground text-background"
          : "bg-secondary/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function ListingCard({ listing: l }: { listing: ListingRow }) {
  return (
    <Link
      to={l.slug ? `/vendors/${l.slug}` : `/vendors/${l.id}`}
      className="group block w-64 shrink-0 overflow-hidden card-soft transition hover:shadow-md"
    >
      <div className="aspect-[4/3] bg-secondary/40 overflow-hidden">
        {l.hero_url ? (
          <img
            src={l.hero_url}
            alt={l.business_name ?? "Vendor"}
            className="w-full h-full object-cover transition group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl font-serif italic text-muted-foreground">
            {(l.business_name ?? "V")[0]?.toUpperCase()}
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground truncate">
          {l.category ?? "Vendor"}
        </p>
        <h3 className="mt-1 font-medium text-foreground truncate">
          {l.business_name ?? "Vendor"}
        </h3>
        <p className="text-xs text-muted-foreground truncate">
          {l.location ?? ""}
          {l.base_price_cents
            ? ` · from $${(l.base_price_cents / 100).toLocaleString()}`
            : ""}
        </p>
      </div>
    </Link>
  );
}

function FeedAuthorHeader({ vendor }: { vendor: Author | null }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-9 w-9 overflow-hidden rounded-full bg-secondary/60 flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
        {vendor?.logo_url ? (
          <img
            src={vendor.logo_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          (vendor?.business_name ?? "V")[0]?.toUpperCase()
        )}
      </div>
      <p className="flex-1 text-sm font-semibold text-foreground truncate">
        {vendor?.business_name ?? "Vendor"}
      </p>
    </div>
  );
}

function PostsFeed({ posts }: { posts: PostRow[] }) {
  if (posts.length === 0) return <EmptyMsg msg="No posts yet." />;
  return (
    <div className="space-y-5 max-w-xl mx-auto">
      {posts.map((p) => (
        <article
          key={p.id}
          className="overflow-hidden rounded-xl bg-card border border-border shadow-sm"
        >
          <FeedAuthorHeader vendor={p.vendor} />
          <div className="aspect-[4/5] bg-secondary/40">
            <img
              src={p.image_url}
              alt={p.caption ?? "Post"}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          {p.caption ? (
            <div className="px-4 py-3">
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {p.caption}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {timeAgo(p.created_at)}
              </p>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ReelsFeed({ reels }: { reels: ReelRow[] }) {
  if (reels.length === 0) return <EmptyMsg msg="No reels yet." />;
  return (
    <div className="space-y-5 max-w-xl mx-auto">
      {reels.map((r) => (
        <div
          key={r.id}
          className="block overflow-hidden rounded-xl bg-card border border-border shadow-sm"
        >
          <FeedAuthorHeader vendor={r.vendor} />
          <div className="relative aspect-[4/5] bg-black">
            <video
              src={`${r.video_url}#t=0.1`}
              poster={r.thumbnail_url ?? undefined}
              className="w-full h-full object-cover bg-black"
              controls
              preload="metadata"
              playsInline
              aria-label={r.caption ?? "Reel"}
            />
          </div>
          {r.caption ? (
            <div className="px-4 py-3">
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {r.caption}
              </p>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function BuzzFeed({ buzz }: { buzz: BuzzRow[] }) {
  if (buzz.length === 0) return <EmptyMsg msg="No buzz yet." />;
  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      {buzz.map((b) => (
        <div key={b.id} className="card-soft p-4">
          <div className="flex items-center gap-2 mb-2">
            {b.vendor?.logo_url ? (
              <img
                src={b.vendor.logo_url}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-secondary/60 flex items-center justify-center text-sm font-medium text-muted-foreground">
                {b.vendor?.business_name?.[0]?.toUpperCase() ?? "V"}
              </div>
            )}
            <p className="text-sm font-medium text-foreground">
              {b.vendor?.business_name ?? "Vendor"}
            </p>
            <span className="text-xs text-muted-foreground ml-auto">
              {timeAgo(b.created_at)}
            </span>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {b.body}
          </p>
        </div>
      ))}
    </div>
  );
}

function EmptyMsg({ msg }: { msg: string }) {
  return (
    <p className="text-sm text-muted-foreground py-12 text-center">{msg}</p>
  );
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}
