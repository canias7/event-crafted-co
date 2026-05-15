// Vendor Home — 4-segment content browser + composers.
//
// Mirrors apps/vendor-mobile/app/(vendor)/home.tsx. Global feed of
// approved vendor content across all vendors, with composers on
// Posts / Reels / Buzz so the current vendor can publish too.
//
// Listings tab reuses the same approved-vendor query as the Customer
// Explore page.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Film,
  Grid3x3,
  ImagePlus,
  Loader2,
  MessageCircle,
  Plus,
  Store,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

  const composerKind: Tab | null =
    composer === "post"
      ? "grid"
      : composer === "reel"
      ? "reels"
      : composer === "buzz"
      ? "buzz"
      : null;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar
        items={vendorNavItems}
        title="Home"
        backPath="/vendor/dashboard"
      />
      <main className="flex-1 pb-20 lg:pb-0">
        <div className="sticky top-0 z-40 border-b border-border bg-card px-4 md:px-8 py-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-display text-2xl">Home</h1>
              <p className="text-sm text-muted-foreground">
                Your feed of posts, reels, buzz, and listings.
              </p>
            </div>
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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="aspect-square w-full rounded-md" />
      ))}
    </div>
  );
}

function PostsFeed({ posts }: { posts: PostRow[] }) {
  if (posts.length === 0) {
    return <EmptyMsg msg="No posts yet — tap New post to create one." />;
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
    return <EmptyMsg msg="No reels yet — tap New reel to upload a video." />;
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
                <p className="text-white/80 line-clamp-2 mt-0.5">{r.caption}</p>
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
    return <EmptyMsg msg="No buzz yet — tap New buzz to share a thought." />;
  }
  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      {buzz.map((b) => (
        <div key={b.id} className="rounded-xl border border-border bg-card p-4">
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

// ── Composers ─────────────────────────────────────────────────────

function BuzzComposerModal({
  userId,
  vendorId,
  onClose,
  onPosted,
}: {
  userId: string;
  vendorId: string;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const trimmed = text.trim();
  const MAX = 280;
  const canPost = trimmed.length > 0 && trimmed.length <= MAX && !posting;

  async function handlePost() {
    if (!canPost) return;
    setPosting(true);
    const { error } = await supabase.from("vendor_buzz").insert({
      vendor_id: vendorId,
      user_id: userId,
      body: trimmed,
    });
    if (error) {
      setPosting(false);
      toast.error(`Couldn't post: ${error.message}`);
      return;
    }
    setText("");
    onPosted();
  }

  return (
    <ModalShell onClose={onClose} title="New buzz">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's happening?"
        maxLength={MAX}
        rows={5}
        className="resize-none"
        autoFocus
      />
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{trimmed.length}/{MAX}</span>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={posting}>
          Cancel
        </Button>
        <Button onClick={handlePost} disabled={!canPost}>
          {posting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Post"
          )}
        </Button>
      </div>
    </ModalShell>
  );
}

function MediaComposerModal({
  kind,
  userId,
  vendorId,
  onClose,
  onPosted,
}: {
  kind: "post" | "reel";
  userId: string;
  vendorId: string;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewUrl = file ? URL.createObjectURL(file) : null;
  const accept = kind === "post" ? "image/*" : "video/*";
  const bucket = kind === "post" ? "vendor-posts" : "vendor-reels";
  const noun = kind === "post" ? "photo" : "video";

  async function handlePost() {
    if (!file) {
      toast.error(`Pick a ${noun} first`);
      return;
    }
    setPosting(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ??
        (kind === "post" ? "jpg" : "mp4");
      const filename = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const path = `${userId}/${filename}`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          contentType:
            file.type || (kind === "post" ? "image/jpeg" : "video/mp4"),
          upsert: false,
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);

      if (kind === "post") {
        const { error: insErr } = await supabase.from("vendor_posts").insert({
          vendor_id: vendorId,
          user_id: userId,
          image_url: pub.publicUrl,
          caption: caption.trim() || null,
        });
        if (insErr) throw insErr;
      } else {
        const { error: insErr } = await supabase.from("vendor_reels").insert({
          vendor_id: vendorId,
          user_id: userId,
          video_url: pub.publicUrl,
          thumbnail_url: null, // server-side thumb gen would go here
          caption: caption.trim() || null,
        });
        if (insErr) throw insErr;
      }
      setCaption("");
      setFile(null);
      onPosted();
    } catch (err) {
      setPosting(false);
      const msg = (err as { message?: string })?.message ?? "Try again.";
      toast.error(`Couldn't post: ${msg}`);
    }
  }

  return (
    <ModalShell onClose={onClose} title={kind === "post" ? "New post" : "New reel"}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {previewUrl ? (
        <div className="relative overflow-hidden rounded-md bg-secondary/40 max-h-80">
          {kind === "post" ? (
            <img src={previewUrl} alt="" className="w-full max-h-80 object-contain" />
          ) : (
            <video src={previewUrl} controls className="w-full max-h-80" />
          )}
          <button
            onClick={() => setFile(null)}
            className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-card/40 p-12 text-muted-foreground hover:bg-card"
        >
          <ImagePlus className="h-8 w-8" />
          <span className="text-sm">Tap to pick a {noun}</span>
        </button>
      )}
      <Textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Add a caption (optional)"
        rows={3}
        className="mt-3 resize-none"
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={posting}>
          Cancel
        </Button>
        <Button onClick={handlePost} disabled={!file || posting}>
          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
        </Button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-medium">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
