// Profile preview overlay — opened from the public listing card.
// Shows what the vendor's identity surface looks like (logo, name,
// bio, posts + reels grid, buzz feed) in a sheet so a host can
// quickly scan their vibe without leaving the listing page.

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Play, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

interface Props {
  vendorId: string;
  businessName: string;
  bio: string | null;
  logoUrl: string | null;
  location: string | null;
  onClose: () => void;
}

export function VendorProfilePreviewSheet({
  vendorId,
  businessName,
  bio,
  logoUrl,
  location,
  onClose,
}: Props) {
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [reels, setReels] = useState<ReelRow[] | null>(null);
  const [buzz, setBuzz] = useState<BuzzRow[] | null>(null);

  // Lock background scroll while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Esc-to-close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    Promise.all([
      supabase
        .from("vendor_posts")
        .select("id, image_url, caption, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(18),
      supabase
        .from("vendor_reels")
        .select("id, video_url, thumbnail_url, caption, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("vendor_buzz")
        .select("id, body, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(6),
    ]).then(([pRes, rRes, bRes]) => {
      if (cancelled) return;
      setPosts((pRes.data as PostRow[] | null) ?? []);
      setReels((rRes.data as ReelRow[] | null) ?? []);
      setBuzz((bRes.data as BuzzRow[] | null) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const loading = posts === null || reels === null || buzz === null;
  const empty =
    !loading &&
    (posts?.length ?? 0) === 0 &&
    (reels?.length ?? 0) === 0 &&
    (buzz?.length ?? 0) === 0;
  const initial = businessName[0]?.toUpperCase() ?? "V";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-2xl bg-[#fffdfa] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/95 border border-border/40 shadow-sm text-foreground/80 hover:bg-white inline-flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="px-6 pt-7 pb-4 flex items-center gap-4 border-b border-border/40">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={businessName}
              className="w-16 h-16 rounded-2xl object-cover bg-[#0a0a0a] shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-[#0a0a0a] flex items-center justify-center shrink-0">
              <span className="font-editorial text-white text-3xl leading-none">
                {initial}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-editorial text-2xl text-foreground leading-tight truncate">
              {businessName}
            </h2>
            {location ? (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {location}
              </p>
            ) : null}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-7">
          {bio ? (
            <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">
              {bio}
            </p>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            </div>
          ) : empty ? (
            <div className="py-12 text-center">
              <p className="font-medium text-sm">No posts yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                This vendor hasn't shared any work on their profile.
              </p>
            </div>
          ) : (
            <>
              {posts && posts.length > 0 ? (
                <section>
                  <p className="font-label text-muted-foreground mb-2">
                    Posts
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {posts.map((p) => (
                      <a
                        key={p.id}
                        href={p.image_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square overflow-hidden rounded-sm bg-secondary/40"
                      >
                        <img
                          src={p.image_url}
                          alt={p.caption ?? ""}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              {reels && reels.length > 0 ? (
                <section>
                  <p className="font-label text-muted-foreground mb-2">
                    Reels
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {reels.map((r) => (
                      <a
                        key={r.id}
                        href={r.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative aspect-[3/4] overflow-hidden rounded-sm bg-secondary/40"
                      >
                        {r.thumbnail_url ? (
                          <img
                            src={r.thumbnail_url}
                            alt={r.caption ?? ""}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-foreground/10" />
                        )}
                        <span className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/55 text-white">
                          <Play className="w-3 h-3 fill-current" />
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              {buzz && buzz.length > 0 ? (
                <section>
                  <p className="font-label text-muted-foreground mb-2">
                    Buzz
                  </p>
                  <ul className="space-y-2">
                    {buzz.map((b) => (
                      <li
                        key={b.id}
                        className="rounded-2xl bg-secondary/50 border border-border/40 px-3.5 py-2.5"
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {b.body}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          {timeAgo(b.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
