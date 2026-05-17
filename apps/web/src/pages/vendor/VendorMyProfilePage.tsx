// Vendor "My Profile" — Instagram-style identity hub showing the
// signed-in vendor's OWN posts / reels / buzz / listings.
//
// Mirrors apps/vendor-mobile/app/(vendor)/profile.tsx (the personal
// profile tab). Header shows avatar / business name / location /
// member-since / verified badge plus 4 mini-stats (posts, reels,
// buzz, listings). Tabs swap the gallery underneath; each non-listing
// tab has its own composer for publishing new content.
//
// Terminology: this is the vendor's ACCOUNT profile (one per user). The
// rows in the vendor_profiles table are LISTINGS — up to 5 per account.
// "Profile" = account; "listing" = marketplace listing row.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Edit3,
  Film,
  Grid3x3,
  MapPin,
  MessageCircle,
  Plus,
  Share2,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BuzzComposerModal,
  MediaComposerModal,
} from "@/components/vendor/Composers";
import { ListingWizardModal } from "@/components/vendor/ListingWizardModal";
import { MediaLightbox } from "@/components/vendor/MediaLightbox";

type LightboxMedia =
  | {
      kind: "post";
      image_url: string;
      caption: string | null;
      created_at: string;
    }
  | {
      kind: "reel";
      video_url: string;
      caption: string | null;
      created_at: string;
    };
import { vendorNavItems } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Tab = "grid" | "reels" | "buzz" | "listing";

interface PostRow {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
}
interface ReelRow {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  created_at: string;
}
interface BuzzRow {
  id: string;
  body: string;
  created_at: string;
}
interface VendorRow {
  id: string;
  business_name: string | null;
  category: string | null;
  location: string | null;
  bio: string | null;
  base_price_cents: number | null;
  logo_url: string | null;
  verified_at: string | null;
  application_status: string | null;
  slug: string | null;
  created_at: string | null;
}

export default function VendorMyProfilePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("grid");
  const [loading, setLoading] = useState(true);
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [primary, setPrimary] = useState<VendorRow | null>(null);
  const [listings, setListings] = useState<VendorRow[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [buzz, setBuzz] = useState<BuzzRow[]>([]);
  const [composer, setComposer] = useState<"post" | "reel" | "buzz" | null>(
    null,
  );
  const [listingWizardOpen, setListingWizardOpen] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxMedia | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data: vps } = await supabase
      .from("vendor_profiles")
      .select(
        "id, business_name, category, location, bio, base_price_cents, logo_url, verified_at, application_status, slug, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    const vendors = ((vps ?? []) as VendorRow[]) ?? [];
    setListings(vendors);
    const primaryRow = vendors[0] ?? null;
    setPrimary(primaryRow);
    setVendorIds(vendors.map((v) => v.id));

    // Posts / reels / buzz belong to the vendor (user_id), not a
    // specific listing. Query by user_id so the feed shows every
    // piece of social content the vendor's ever published,
    // regardless of which (or zero) listings they have.
    const [postsRes, reelsRes, buzzRes] = await Promise.all([
      supabase
        .from("vendor_posts")
        .select("id, image_url, caption, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("vendor_reels")
        .select("id, video_url, thumbnail_url, caption, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("vendor_buzz")
        .select("id, body, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    setPosts((postsRes.data ?? []) as PostRow[]);
    setReels((reelsRes.data ?? []) as ReelRow[]);
    setBuzz((buzzRes.data ?? []) as BuzzRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const memberSince = useMemo(() => {
    if (!primary?.created_at) return "—";
    return String(new Date(primary.created_at).getFullYear());
  }, [primary?.created_at]);

  // Open the listing wizard modal. Used to insert an empty draft row
  // and navigate to /vendor/listing?id=X — but /vendor/listing was
  // eliminated in the route cleanup, and "no drafts" means we never
  // want a half-empty vendor_profiles row sitting in the DB. The wizard
  // (fields TBD by product) will collect everything up front and INSERT
  // once with application_status='pending'.
  function openListingWizard() {
    if (!user?.id) return;
    setListingWizardOpen(true);
  }

  // Share the vendor's public listing URL. Falls back to clipboard
  // when the browser doesn't expose navigator.share (desktop Chrome).
  async function onShare() {
    if (!primary) return;
    const slugOrId = primary.slug ?? primary.id;
    const url = `${window.location.origin}/vendors/${slugOrId}`;
    const text = `${primary.business_name ?? "Check out my listing"} on Vendora`;
    // Web Share API (mobile browsers + Safari)
    if (
      typeof navigator !== "undefined" &&
      typeof (navigator as Navigator & { share?: unknown }).share === "function"
    ) {
      try {
        await (
          navigator as Navigator & {
            share: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
          }
        ).share({ title: text, text, url });
        return;
      } catch {
        // user-cancelled — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard.");
    } catch {
      toast.info(url);
    }
  }

  const initials = useMemo(() => {
    const n = primary?.business_name ?? user?.email ?? "V";
    return n.trim()[0]?.toUpperCase() ?? "V";
  }, [primary?.business_name, user?.email]);

  const stats = {
    posts: posts.length,
    reels: reels.length,
    buzz: buzz.length,
    listings: listings.length,
  };

  const TABS: Array<{ id: Tab; label: string; icon: typeof Grid3x3 }> = [
    { id: "grid", label: `Posts · ${stats.posts}`, icon: Grid3x3 },
    { id: "reels", label: `Reels · ${stats.reels}`, icon: Film },
    { id: "buzz", label: `Buzz · ${stats.buzz}`, icon: MessageCircle },
    { id: "listing", label: `Listings · ${stats.listings}`, icon: Store },
  ];

  return (
    <div className="flex min-h-screen vendor-canvas">
      <DashboardSidebar
        items={vendorNavItems}
        title="My Profile"
        backPath="/vendor/home"
      />
      <main className="flex-1 pb-20 lg:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5">
          <h1 className="font-editorial text-3xl">My Profile</h1>
          <p className="text-sm text-muted-foreground">
            Your posts, reels, buzz, and listings — only yours.
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
          {loading && !primary ? (
            <Skeleton className="h-44 w-full rounded-2xl" />
          ) : (
            <HeaderCard
              initials={initials}
              logoUrl={primary?.logo_url ?? null}
              businessName={primary?.business_name ?? user?.email ?? "Vendor"}
              location={primary?.location ?? null}
              memberSince={memberSince}
              verified={!!primary?.verified_at}
              category={primary?.category ?? null}
              listingHref={primary?.slug ? `/vendors/${primary.slug}` : null}
              stats={stats}
              onShare={onShare}
            />
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
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
            {tab !== "listing" ? (
              <Button
                onClick={() =>
                  setComposer(
                    tab === "grid" ? "post" : tab === "reels" ? "reel" : "buzz",
                  )
                }
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

          <div>
            {loading ? (
              <Skeleton className="h-72 w-full rounded-md" />
            ) : tab === "grid" ? (
              <PostsGrid posts={posts} onOpen={setLightbox} />
            ) : tab === "reels" ? (
              <ReelsGrid reels={reels} onOpen={setLightbox} />
            ) : tab === "buzz" ? (
              <BuzzList buzz={buzz} />
            ) : (
              <ListingsList
                listings={listings}
                onAddListing={openListingWizard}
              />
            )}
          </div>
        </div>
      </main>
      <MobileNav items={vendorNavItems} />

      {composer === "buzz" && user ? (
        <BuzzComposerModal
          userId={user.id}
          onClose={() => setComposer(null)}
          onPosted={() => {
            setComposer(null);
            load();
          }}
        />
      ) : null}
      {(composer === "post" || composer === "reel") && user ? (
        <MediaComposerModal
          kind={composer}
          userId={user.id}
          onClose={() => setComposer(null)}
          onPosted={() => {
            setComposer(null);
            load();
          }}
        />
      ) : null}
      {listingWizardOpen && user ? (
        <ListingWizardModal
          userId={user.id}
          onClose={() => setListingWizardOpen(false)}
          onPublished={() => {
            setListingWizardOpen(false);
            load();
          }}
        />
      ) : null}
      <MediaLightbox item={lightbox} onClose={() => setLightbox(null)} />
      {void vendorIds /* silence unused */}
    </div>
  );
}

function HeaderCard({
  initials,
  logoUrl,
  businessName,
  location,
  memberSince,
  verified,
  category,
  listingHref,
  stats,
  onShare,
}: {
  initials: string;
  logoUrl: string | null;
  businessName: string;
  location: string | null;
  memberSince: string;
  verified: boolean;
  category: string | null;
  listingHref: string | null;
  stats: { posts: number; reels: number; buzz: number; listings: number };
  onShare: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 shadow-[0_8px_24px_-12px_rgba(26,20,16,0.18)] p-6 flex flex-col sm:flex-row gap-5 items-start bg-[linear-gradient(135deg,#ffffff_0%,#f3f4f6_100%)]">
      {/* Soft radial sun + horizontal ripple lines echoing the mobile
          CreamOcean hero. Decorative, behind the avatar/copy. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(circle at 18% 22%, rgba(255,230,180,0.55), transparent 55%)",
        }}
      />
      <div className="relative shrink-0">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={businessName}
            className="w-24 h-24 rounded-full object-cover bg-secondary"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-foreground text-background flex items-center justify-center font-editorial text-4xl">
            {initials}
          </div>
        )}
        {verified ? (
          <div className="absolute -right-1 bottom-1 w-7 h-7 rounded-full bg-card border-2 border-background flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
        ) : null}
      </div>
      <div className="relative flex-1 min-w-0">
        <h2 className="font-editorial text-2xl text-foreground truncate">
          {businessName}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {category ? <>{category}</> : null}
          {category && location ? " · " : null}
          {location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {location}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Member since {memberSince}
        </p>
        <div className="mt-4 grid grid-cols-4 gap-2 max-w-sm">
          <Stat label="Posts" value={String(stats.posts)} />
          <Stat label="Reels" value={String(stats.reels)} />
          <Stat label="Buzz" value={String(stats.buzz)} />
          <Stat label="Listings" value={String(stats.listings)} />
        </div>
      </div>
      <div className="relative shrink-0 flex flex-col gap-2">
        {listingHref ? (
          <Link to={listingHref}>
            <Button variant="outline" className="rounded-full bg-white/70" size="sm">
              View public page
            </Button>
          </Link>
        ) : null}
        <Button
          variant="outline"
          className="rounded-full"
          size="sm"
          onClick={onShare}
        >
          <Share2 className="h-3.5 w-3.5 mr-1" />
          Share profile
        </Button>
        <Link to="/vendor/edit-profile">
          <Button variant="outline" className="rounded-full" size="sm">
            <Edit3 className="h-3.5 w-3.5 mr-1" />
            Edit identity
          </Button>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center sm:items-start">
      <span className="text-lg font-semibold tnum">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function PostsGrid({
  posts,
  onOpen,
}: {
  posts: PostRow[];
  onOpen: (m: LightboxMedia) => void;
}) {
  if (posts.length === 0) {
    return <Empty msg="No posts yet — tap New post to create one." />;
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
      {posts.map((p) => (
        <button
          key={p.id}
          onClick={() =>
            onOpen({
              kind: "post",
              image_url: p.image_url,
              caption: p.caption,
              created_at: p.created_at,
            })
          }
          className="relative aspect-square overflow-hidden rounded-md bg-secondary/40 group"
        >
          <img
            src={p.image_url}
            alt={p.caption ?? "Post"}
            className="w-full h-full object-cover transition group-hover:scale-[1.02]"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );
}

function ReelsGrid({
  reels,
  onOpen,
}: {
  reels: ReelRow[];
  onOpen: (m: LightboxMedia) => void;
}) {
  if (reels.length === 0) {
    return <Empty msg="No reels yet — tap New reel to upload a video." />;
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
      {reels.map((r) => (
        <button
          key={r.id}
          onClick={() =>
            onOpen({
              kind: "reel",
              video_url: r.video_url,
              caption: r.caption,
              created_at: r.created_at,
            })
          }
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
          {r.caption ? (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-xs text-white line-clamp-2">
              {r.caption}
            </div>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function BuzzList({ buzz }: { buzz: BuzzRow[] }) {
  if (buzz.length === 0) {
    return <Empty msg="No buzz yet — tap New buzz to share a thought." />;
  }
  return (
    <div className="space-y-3 max-w-2xl">
      {buzz.map((b) => (
        <div key={b.id} className="card-soft p-4">
          <p className="text-sm text-foreground whitespace-pre-wrap">{b.body}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {new Date(b.created_at).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );
}

function ListingsList({
  listings,
  onAddListing,
}: {
  listings: VendorRow[];
  onAddListing: () => void;
}) {
  if (listings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
        <p className="text-sm text-muted-foreground mb-3">No listing yet.</p>
        <Button onClick={onAddListing}>Create your listing</Button>
      </div>
    );
  }
  return (
    <div>
    <div className="mb-3 flex justify-end">
      <Button
        onClick={onAddListing}
        variant="outline"
        size="sm"
        className="rounded-full"
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        New listing
      </Button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {listings.map((l) => (
        <div
          key={l.id}
          className="card-soft p-4 flex gap-3"
        >
          {l.logo_url ? (
            <img
              src={l.logo_url}
              alt=""
              className="w-14 h-14 rounded-md object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-md bg-secondary flex items-center justify-center text-foreground">
              <Store className="h-5 w-5" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{l.business_name ?? "Listing"}</p>
            <p className="text-xs text-muted-foreground truncate">
              {l.category ?? "Vendor"}
              {l.location ? ` · ${l.location}` : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {l.application_status === "approved"
                ? "Live"
                : l.application_status === "pending"
                  ? "Pending review"
                  : l.application_status ?? "Draft"}
            </p>
          </div>
          {/* No edit affordance per the "no editing in listings, only new
              ones" product rule. View link only shows when the listing
              is approved and has a slug. */}
          {l.slug ? (
            <Link
              to={`/vendors/${l.slug}`}
              className="self-start text-xs font-semibold text-foreground hover:text-muted-foreground"
            >
              View
            </Link>
          ) : null}
        </div>
      ))}
    </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <p className="text-sm text-muted-foreground py-12 text-center">{msg}</p>
  );
}
