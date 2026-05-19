// Profile preview overlay — opened from the public listing's brand
// card. Mirrors the layout the vendor sees on /vendor/me so a host
// can scan exactly what the vendor's identity surface looks like
// without leaving the listing page.

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Film,
  Grid3x3,
  Loader2,
  MessageCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandCardShell } from "@/components/vendor/BrandCardShell";

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

type Tab = "grid" | "reels" | "buzz";

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
  const [tab, setTab] = useState<Tab>("grid");

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
    (async () => {
      // Content is user-scoped (vendor's identity), not per-listing.
      // Resolve the owner once, then fetch all their work.
      const { data: vp } = await supabase
        .from("vendor_profiles")
        .select("user_id")
        .eq("id", vendorId)
        .maybeSingle();
      const ownerId = (vp as { user_id?: string } | null)?.user_id ?? null;
      if (!ownerId) {
        if (cancelled) return;
        setPosts([]);
        setReels([]);
        setBuzz([]);
        return;
      }
      const [pRes, rRes, bRes] = await Promise.all([
        supabase
          .from("vendor_posts")
          .select("id, image_url, caption, created_at")
          .eq("user_id", ownerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("vendor_reels")
          .select("id, video_url, thumbnail_url, caption, created_at")
          .eq("user_id", ownerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("vendor_buzz")
          .select("id, body, created_at")
          .eq("user_id", ownerId)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setPosts((pRes.data as PostRow[] | null) ?? []);
      setReels((rRes.data as ReelRow[] | null) ?? []);
      setBuzz((bRes.data as BuzzRow[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const loading = posts === null || reels === null || buzz === null;
  const initial = businessName[0]?.toUpperCase() ?? "V";

  const tabs = useMemo(
    () => [
      {
        id: "grid" as const,
        label: `Posts · ${posts?.length ?? 0}`,
        icon: Grid3x3,
      },
      {
        id: "reels" as const,
        label: `Reels · ${reels?.length ?? 0}`,
        icon: Film,
      },
      {
        id: "buzz" as const,
        label: `Buzz · ${buzz?.length ?? 0}`,
        icon: MessageCircle,
      },
    ],
    [posts, reels, buzz],
  );

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
      style={{
        zIndex: 9999,
        background: "rgba(0,0,0,0.25)",
        backdropFilter: "blur(32px) saturate(140%)",
        WebkitBackdropFilter: "blur(32px) saturate(140%)",
      }}
    >
      <div
        className="relative w-full sm:max-w-4xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(255,253,250,0.55)",
          border: "0.5px solid rgba(255,255,255,0.5)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
        }}
      >
        {/* Top bar — back arrow on the left mirrors how mobile screens
            unwind a stack. No close X; the back arrow is the dismiss. */}
        <div
          className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-white/40"
          style={{
            background: "rgba(255,253,250,0.6)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/85 border border-white/60 shadow-sm text-foreground/80 hover:bg-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <p className="text-sm font-medium text-foreground/80 truncate">
            {businessName}
          </p>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-4 md:px-7 py-6 space-y-6">
          {/* Header card — uses the shared BrandCardShell so the
              identity surface (gradient + ripples + flip-to-bio
              toggle) matches /vendor/me + /vendors/<slug> exactly. */}
          <BrandCardShell businessName={businessName} bio={bio}>
            <div className="flex items-center gap-5 pl-14 sm:pl-16">
              <div className="relative shrink-0">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={businessName}
                    className="w-[110px] h-[110px] rounded-[20px] object-cover bg-[#0a0a0a]"
                    style={{
                      boxShadow: "0 6px 18px -6px rgba(26,20,16,0.3)",
                    }}
                  />
                ) : (
                  <div
                    className="w-[110px] h-[110px] rounded-[20px] bg-[#0a0a0a] flex items-center justify-center"
                    style={{
                      boxShadow: "0 6px 18px -6px rgba(26,20,16,0.3)",
                    }}
                  >
                    <span className="font-editorial text-[#ffffff] text-6xl leading-none">
                      {initial}
                    </span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-editorial text-3xl text-[#0a0a0a] leading-[1.05] tracking-tight">
                  {businessName}
                </h3>
                {location ? (
                  <p className="mt-1 text-sm text-[#6b7280]">{location}</p>
                ) : null}
              </div>
            </div>
          </BrandCardShell>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition shrink-0 ${
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

          {/* Tab content */}
          <div>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              </div>
            ) : tab === "grid" ? (
              posts && posts.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-4">
                  {posts.map((p) => (
                    <a
                      key={p.id}
                      href={p.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-left group"
                    >
                      <div className="relative aspect-square overflow-hidden rounded-md bg-secondary/40">
                        <img
                          src={p.image_url}
                          alt={p.caption ?? "Post"}
                          loading="lazy"
                          className="w-full h-full object-cover transition group-hover:scale-[1.02]"
                        />
                      </div>
                      {p.caption ? (
                        <p className="mt-2 text-xs text-foreground/80 leading-snug line-clamp-2">
                          {p.caption}
                        </p>
                      ) : null}
                    </a>
                  ))}
                </div>
              ) : (
                <Empty msg="No posts yet." />
              )
            ) : tab === "reels" ? (
              reels && reels.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-4">
                  {reels.map((r) => (
                    <a
                      key={r.id}
                      href={r.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-left group"
                    >
                      <div className="relative aspect-square overflow-hidden rounded-md bg-black">
                        {r.thumbnail_url ? (
                          <img
                            src={r.thumbnail_url}
                            alt={r.caption ?? "Reel"}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <video
                            src={`${r.video_url}#t=0.1`}
                            className="w-full h-full object-cover pointer-events-none"
                            preload="metadata"
                            muted
                            playsInline
                            aria-label={r.caption ?? "Reel"}
                          />
                        )}
                        <span className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/55 text-white">
                          <Film className="w-3 h-3" aria-hidden />
                        </span>
                      </div>
                      {r.caption ? (
                        <p className="mt-2 text-xs text-foreground/80 leading-snug line-clamp-2">
                          {r.caption}
                        </p>
                      ) : null}
                    </a>
                  ))}
                </div>
              ) : (
                <Empty msg="No reels yet." />
              )
            ) : buzz && buzz.length > 0 ? (
              <ul className="space-y-2">
                {buzz.map((b) => (
                  <li
                    key={b.id}
                    className="rounded-2xl bg-white/55 border border-white/60 backdrop-blur-sm px-3.5 py-2.5"
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
            ) : (
              <Empty msg="No buzz yet." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}
