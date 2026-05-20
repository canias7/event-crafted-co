// Host content tabs + composer — Instagram-style identity hub for
// the host's OWN posts / reels / buzz. Mirrors the structure
// VendorMyProfilePage had before social content moved to the host
// side. Lives on HostProfilePage between the hero card and the
// account settings link.

import { useCallback, useEffect, useState } from "react";
import { Film, Grid3x3, MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  BuzzComposerModal,
  MediaComposerModal,
} from "@/components/vendor/Composers";
import { MediaLightbox } from "@/components/vendor/MediaLightbox";

type Tab = "grid" | "reels" | "buzz";

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
type LightboxMedia =
  | { kind: "post"; image_url: string; caption: string | null; created_at: string }
  | { kind: "reel"; video_url: string; caption: string | null; created_at: string };

export function HostContentSection({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>("grid");
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [buzz, setBuzz] = useState<BuzzRow[]>([]);
  const [composer, setComposer] = useState<"post" | "reel" | "buzz" | null>(null);
  const [lightbox, setLightbox] = useState<LightboxMedia | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [postsRes, reelsRes, buzzRes] = await Promise.all([
      supabase
        .from("posts")
        .select("id, image_url, caption, created_at")
        .eq("author_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("reels")
        .select("id, video_url, thumbnail_url, caption, created_at")
        .eq("author_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("buzz")
        .select("id, body, created_at")
        .eq("author_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    setPosts((postsRes.data ?? []) as PostRow[]);
    setReels((reelsRes.data ?? []) as ReelRow[]);
    setBuzz((buzzRes.data ?? []) as BuzzRow[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const TABS: Array<{ id: Tab; label: string; icon: typeof Grid3x3 }> = [
    { id: "grid", label: `Posts · ${posts.length}`, icon: Grid3x3 },
    { id: "reels", label: `Reels · ${reels.length}`, icon: Film },
    { id: "buzz", label: `Buzz · ${buzz.length}`, icon: MessageCircle },
  ];

  return (
    <div className="space-y-4">
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
        <Button
          onClick={() =>
            setComposer(tab === "grid" ? "post" : tab === "reels" ? "reel" : "buzz")
          }
          className="rounded-full"
        >
          <Plus className="h-4 w-4 mr-1" />
          {tab === "grid" ? "New post" : tab === "reels" ? "New reel" : "New buzz"}
        </Button>
      </div>

      <div>
        {loading ? (
          <Skeleton className="h-72 w-full rounded-md" />
        ) : tab === "grid" ? (
          <PostsGrid posts={posts} onOpen={setLightbox} />
        ) : tab === "reels" ? (
          <ReelsGrid reels={reels} onOpen={setLightbox} />
        ) : (
          <BuzzList buzz={buzz} />
        )}
      </div>

      {composer === "buzz" ? (
        <BuzzComposerModal
          userId={userId}
          onClose={() => setComposer(null)}
          onPosted={() => {
            setComposer(null);
            load();
          }}
        />
      ) : null}
      {(composer === "post" || composer === "reel") ? (
        <MediaComposerModal
          kind={composer}
          userId={userId}
          onClose={() => setComposer(null)}
          onPosted={() => {
            setComposer(null);
            load();
          }}
        />
      ) : null}

      <MediaLightbox item={lightbox} onClose={() => setLightbox(null)} />
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
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-4">
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
          className="text-left group"
        >
          <div className="relative aspect-square overflow-hidden rounded-md bg-secondary/40">
            <img
              src={p.image_url}
              alt={p.caption ?? "Post"}
              className="w-full h-full object-cover transition group-hover:scale-[1.02]"
              loading="lazy"
            />
          </div>
          {p.caption ? (
            <p className="mt-2 text-xs text-foreground/80 leading-snug line-clamp-2">
              {p.caption}
            </p>
          ) : null}
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
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-4">
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
          className="text-left group"
        >
          <div className="relative aspect-square overflow-hidden rounded-md bg-black">
            {r.thumbnail_url ? (
              <img
                src={r.thumbnail_url}
                alt={r.caption ?? "Reel"}
                className="w-full h-full object-cover"
                loading="lazy"
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

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}
