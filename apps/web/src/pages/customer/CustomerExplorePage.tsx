// Customer Explore. Mirrors apps/host-mobile/app/(host)/explore.tsx —
// the global feed of approved vendor activity. Four tabs:
//   - Listings: vendor profiles (the marketplace)
//   - Posts: photo posts vendors share
//   - Reels: vendor videos
//   - Buzz: short-form text from vendors
//
// All queries inner-join application_status='approved' so unpublished
// drafts stay out of the feed. Tap any listing -> /vendors/<slug>.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Film, Grid3x3, MessageCircle, Store } from "lucide-react";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Skeleton } from "@/components/ui/skeleton";
import { customerNavItems } from "@/data/navItems";
import { supabase } from "@/integrations/supabase/client";

type Tab = "listing" | "grid" | "reels" | "buzz";

type Author = { business_name: string | null; logo_url: string | null };

interface PostRow {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  vendor_id: string;
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

export default function CustomerExplorePage() {
  const [tab, setTab] = useState<Tab>("listing");
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [buzz, setBuzz] = useState<BuzzRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);

  const loadFeeds = useCallback(async () => {
    setLoading(true);
    const [postsRes, reelsRes, buzzRes, listingsRes, portfolioRes] =
      await Promise.all([
        supabase
          .from("vendor_posts")
          .select(
            "id, image_url, caption, created_at, vendor_id, vendor:vendor_profiles!inner(business_name, logo_url, application_status)",
          )
          .eq("vendor.application_status", "approved")
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("vendor_reels")
          .select(
            "id, video_url, thumbnail_url, caption, created_at, vendor:vendor_profiles!inner(business_name, logo_url, application_status)",
          )
          .eq("vendor.application_status", "approved")
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("vendor_buzz")
          .select(
            "id, body, created_at, vendor:vendor_profiles!inner(business_name, logo_url, application_status)",
          )
          .eq("vendor.application_status", "approved")
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("vendor_profiles")
          .select(
            "id, business_name, category, location, base_price_cents, bio, logo_url, slug",
          )
          .eq("application_status", "approved")
          .not("location", "is", null)
          .not("bio", "is", null)
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
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar
        items={customerNavItems}
        title="Explore"
        backPath="/customer/dashboard"
      />
      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="sticky top-0 z-40 border-b border-border bg-card px-4 md:px-8 py-4 space-y-3">
          <div>
            <h1 className="font-display text-2xl">Explore</h1>
            <p className="text-sm text-muted-foreground">
              Browse approved vendors, posts, reels, and buzz.
            </p>
          </div>
          <div className="flex gap-1 overflow-x-auto">
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
        </div>

        <div className="p-4 md:p-8">
          {loading ? (
            <LoadingGrid />
          ) : tab === "listing" ? (
            <ListingsFeed listings={listings} />
          ) : tab === "grid" ? (
            <PostsFeed posts={posts} />
          ) : tab === "reels" ? (
            <ReelsFeed reels={reels} />
          ) : (
            <BuzzFeed buzz={buzz} />
          )}
        </div>
      </main>
      <MobileNav items={customerNavItems} />
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

function ListingsFeed({ listings }: { listings: ListingRow[] }) {
  if (listings.length === 0) {
    return <EmptyMsg msg="No listings yet — check back soon." />;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {listings.map((l) => (
        <Link
          key={l.id}
          to={l.slug ? `/vendors/${l.slug}` : `/vendors/${l.id}`}
          className="group overflow-hidden rounded-xl border border-border bg-card transition hover:shadow-md"
        >
          <div className="aspect-[4/3] bg-secondary/40 overflow-hidden">
            {l.hero_url ? (
              <img
                src={l.hero_url}
                alt={l.business_name ?? "Vendor"}
                className="w-full h-full object-cover transition group-hover:scale-[1.02]"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-serif italic text-muted-foreground">
                {(l.business_name ?? "V")[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="p-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
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
      ))}
    </div>
  );
}

function PostsFeed({ posts }: { posts: PostRow[] }) {
  if (posts.length === 0) {
    return <EmptyMsg msg="No posts yet." />;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {posts.map((p) => (
        <div
          key={p.id}
          className="relative aspect-square overflow-hidden rounded-md bg-secondary/40"
        >
          <img
            src={p.image_url}
            alt={p.caption ?? "Post"}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {p.vendor?.business_name ? (
            <div className="absolute bottom-0 left-0 right-0 bg-black/45 px-2 py-1 text-xs text-white truncate">
              {p.vendor.business_name}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ReelsFeed({ reels }: { reels: ReelRow[] }) {
  if (reels.length === 0) {
    return <EmptyMsg msg="No reels yet." />;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {reels.map((r) => (
        <a
          key={r.id}
          href={r.video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative aspect-[9/16] overflow-hidden rounded-md bg-black"
        >
          {r.thumbnail_url ? (
            <img
              src={r.thumbnail_url}
              alt={r.caption ?? "Reel"}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white">
              <Film className="h-8 w-8" />
            </div>
          )}
          <div className="absolute inset-0 flex items-end justify-start p-2 bg-gradient-to-t from-black/60 to-transparent">
            <div className="text-white text-xs">
              <p className="font-medium truncate">
                {r.vendor?.business_name ?? "Vendor"}
              </p>
              {r.caption ? (
                <p className="text-white/80 line-clamp-2 mt-0.5">
                  {r.caption}
                </p>
              ) : null}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

function BuzzFeed({ buzz }: { buzz: BuzzRow[] }) {
  if (buzz.length === 0) {
    return <EmptyMsg msg="No buzz yet." />;
  }
  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      {buzz.map((b) => (
        <div
          key={b.id}
          className="rounded-xl border border-border bg-card p-4"
        >
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
