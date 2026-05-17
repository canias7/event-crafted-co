// Vendor Home — 4-segment content browser + composers.
//
// Mirrors apps/vendor-mobile/app/(vendor)/home.tsx. Global feed of
// approved vendor content across all vendors, with composers on
// Posts / Reels / Buzz so the current vendor can publish too.
//
// Listings tab reuses the same approved-vendor query as the Customer
// Explore page.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Film,
  Grid3x3,
  MessageCircle,
  Plus,
  Store,
} from "lucide-react";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BuzzComposerModal,
  MediaComposerModal,
} from "@/components/vendor/Composers";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { vendorNavItems } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Tab = "grid" | "reels" | "buzz" | "listing";

type Author = { business_name: string | null; logo_url: string | null } | null;

interface PostRow {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  vendor_id: string;
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

const TABS: Array<{ id: Tab; label: string; icon: typeof Grid3x3 }> = [
  { id: "grid", label: "Posts", icon: Grid3x3 },
  { id: "reels", label: "Reels", icon: Film },
  { id: "buzz", label: "Buzz", icon: MessageCircle },
  { id: "listing", label: "Listings", icon: Store },
];

export default function VendorHomePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("grid");
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [buzz, setBuzz] = useState<BuzzRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [composer, setComposer] = useState<"post" | "reel" | "buzz" | null>(
    null,
  );

  // Resolve the current user's vendor_profile id so composers can
  // tag the row correctly.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setVendorId((data as { id?: string } | null)?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const loadFeeds = useCallback(async () => {
    setLoading(true);
    const [postsRes, reelsRes, buzzRes, listingsRes, portfolioRes] =
      await Promise.all([
        supabase
          .from("vendor_posts")
          .select(
            "id, image_url, caption, created_at, vendor_id, vendor:profiles!vendor_posts_user_id_profiles_fkey!inner(business_name, logo_url, role, application_status)",
          )
          .eq("vendor.role", "vendor")
          .eq("vendor.application_status", "approved")
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("vendor_reels")
          .select(
            "id, video_url, thumbnail_url, caption, created_at, vendor:profiles!vendor_reels_user_id_profiles_fkey!inner(business_name, logo_url, role, application_status)",
          )
          .eq("vendor.role", "vendor")
          .eq("vendor.application_status", "approved")
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("vendor_buzz")
          .select(
            "id, body, created_at, vendor:profiles!vendor_buzz_user_id_profiles_fkey!inner(business_name, logo_url, role, application_status)",
          )
          .eq("vendor.role", "vendor")
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

  const composerKind: Tab | null =
    composer === "post"
      ? "grid"
      : composer === "reel"
      ? "reels"
      : composer === "buzz"
      ? "buzz"
      : null;

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar
        items={vendorNavItems}
        title="Home"
        backPath="/vendor/home"
      />
      <main className="flex-1 pb-20 lg:pb-0">
        <div className="sticky top-0 z-40 backdrop-blur-sm px-4 md:px-8 py-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-editorial text-3xl">Home</h1>
              <p className="text-sm text-muted-foreground">
                Your feed of posts, reels, buzz, and listings.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell variant="light" />
            {tab !== "listing" ? (
              <Button
                onClick={() =>
                  setComposer(
                    tab === "grid" ? "post" : tab === "reels" ? "reel" : "buzz",
                  )
                }
                disabled={!vendorId}
                className="rounded-full"
              >
                <Plus className="h-4 w-4 mr-1" />
                {tab === "grid"
                  ? "New post"
                  : tab === "reels"
                  ? "New reel"
                  : "New buzz"}
              </Button>
            ) : null}
            </div>
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
                      : "bg-white/40 border border-white/55 text-muted-foreground hover:bg-white/70 hover:text-foreground"
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
          ) : tab === "grid" ? (
            <PostsFeed posts={posts} />
          ) : tab === "reels" ? (
            <ReelsFeed reels={reels} />
          ) : tab === "buzz" ? (
            <BuzzFeed buzz={buzz} />
          ) : (
            <ListingsFeed listings={listings} />
          )}
        </div>
      </main>
      <MobileNav items={vendorNavItems} />

      {composer === "buzz" && user && vendorId ? (
        <BuzzComposerModal
          userId={user.id}
          vendorId={vendorId}
          onClose={() => setComposer(null)}
          onPosted={() => {
            setComposer(null);
            loadFeeds();
          }}
        />
      ) : null}
      {(composer === "post" || composer === "reel") && user && vendorId ? (
        <MediaComposerModal
          kind={composer}
          userId={user.id}
          vendorId={vendorId}
          onClose={() => setComposer(null)}
          onPosted={() => {
            setComposer(null);
            loadFeeds();
          }}
        />
      ) : null}
      {void composerKind /* silence unused */}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="space-y-5 max-w-xl mx-auto">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="aspect-[4/5] w-full rounded-xl" />
      ))}
    </div>
  );
}

function FeedAuthorHeader({ vendor }: { vendor: Author }) {
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
  if (posts.length === 0) {
    return <EmptyMsg msg="No posts yet — tap New post to create one." />;
  }
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
  if (reels.length === 0) {
    return <EmptyMsg msg="No reels yet — tap New reel to upload a video." />;
  }
  return (
    <div className="space-y-5 max-w-xl mx-auto">
      {reels.map((r) => (
        <div
          key={r.id}
          className="block overflow-hidden rounded-xl bg-card border border-border shadow-sm"
        >
          <FeedAuthorHeader vendor={r.vendor} />
          <div className="relative aspect-[4/5] bg-black">
            {/* Inline player — native controls so the host can pause /
                scrub / mute without leaving the feed. Poster falls
                back to the stored thumbnail when one exists; without
                one the browser uses the first frame via #t=0.1. */}
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
  if (buzz.length === 0) {
    return <EmptyMsg msg="No buzz yet — tap New buzz to share a thought." />;
  }
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

function ListingsFeed({ listings }: { listings: ListingRow[] }) {
  if (listings.length === 0) {
    return <EmptyMsg msg="No listings yet." />;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {listings.map((l) => (
        <Link
          key={l.id}
          to={l.slug ? `/vendors/${l.slug}` : `/vendors/${l.id}`}
          className="group overflow-hidden card-soft transition hover:shadow-md"
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
