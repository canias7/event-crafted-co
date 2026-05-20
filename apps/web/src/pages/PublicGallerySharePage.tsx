// Public viewer for vendor-gallery share tokens at /g/:token.
// Uses get_share_payload — a SECURITY DEFINER RPC that validates
// the token + optional password, then returns the share kind +
// image_url / caption / blurhash / width / height for the
// underlying image(s). EXIF + file_size_bytes are intentionally
// withheld; vendor_gallery_images / _albums no longer have
// public-read RLS, so this RPC is the only public path.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Loader2, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicNav } from "@/components/public/PublicNav";
import { downloadCrossOrigin } from "@/lib/downloadImage";

interface ImageRow {
  id: string;
  image_url: string;
  caption: string | null;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

interface SharePayload {
  kind: "image" | "album";
  album_name: string | null;
  images: ImageRow[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

const PAGE_SIZE = 200;

type State =
  | { status: "loading" }
  | { status: "needs_password"; error?: string }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "image"; image: ImageRow }
  | {
      status: "album";
      album_name: string;
      images: ImageRow[];
      total: number;
      hasMore: boolean;
    };

export default function PublicGallerySharePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ status: "loading" });
  const [passwordInput, setPasswordInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  // Cached password for follow-up Load more calls. Set once the
  // first resolve succeeds with the right password (or null when
  // the share isn't protected).
  const [authedPassword, setAuthedPassword] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const resolve = useCallback(
    async (password: string | null, offset = 0) => {
      if (!token) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_share_payload", {
        p_token: token,
        p_password: password,
        p_offset: offset,
        p_limit: PAGE_SIZE,
      });
      if (error) {
        const msg = error.message;
        if (msg.includes("not_found")) setState({ status: "not_found" });
        else if (msg.includes("expired")) setState({ status: "expired" });
        else if (msg.includes("needs_password")) setState({ status: "needs_password" });
        else if (msg.includes("bad_password"))
          setState({ status: "needs_password", error: "Wrong password" });
        else setState({ status: "not_found" });
        return;
      }
      const payload = data as SharePayload | null;
      if (!payload) {
        setState({ status: "not_found" });
        return;
      }
      setAuthedPassword(password);
      if (payload.kind === "image") {
        const img = payload.images[0];
        if (!img) {
          setState({ status: "not_found" });
          return;
        }
        setState({ status: "image", image: img });
      } else {
        setState({
          status: "album",
          album_name: payload.album_name ?? "Album",
          images: payload.images,
          total: payload.total,
          hasMore: payload.has_more,
        });
      }
    },
    [token],
  );

  // Append next page of an album payload to the current state.
  const loadMore = useCallback(async () => {
    if (state.status !== "album" || !state.hasMore || loadingMore) return;
    setLoadingMore(true);
    const offset = state.images.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("get_share_payload", {
      p_token: token,
      p_password: authedPassword,
      p_offset: offset,
      p_limit: PAGE_SIZE,
    });
    setLoadingMore(false);
    if (error) return;
    const payload = data as SharePayload | null;
    if (!payload || payload.kind !== "album") return;
    setState((prev) =>
      prev.status === "album"
        ? {
            ...prev,
            images: [...prev.images, ...payload.images],
            hasMore: payload.has_more,
          }
        : prev,
    );
  }, [state, token, authedPassword, loadingMore]);

  useEffect(() => {
    void resolve(null);
  }, [resolve]);

  // Inject SEO / social-card meta tags once the share resolves so
  // a link pasted into Slack / Discord / iMessage previews with an
  // image + title instead of a blank URL. Reset on unmount so we
  // don't leak this state into other client-navigated routes.
  useEffect(() => {
    if (state.status !== "image" && state.status !== "album") return;
    const preview =
      state.status === "image"
        ? {
            title: state.image.caption ?? "Shared photo",
            description: "",
            image: state.image.image_url,
          }
        : {
            title: state.album_name,
            description: `${state.total} photo${state.total === 1 ? "" : "s"}`,
            image: state.images[0]?.image_url ?? "",
          };
    const prevTitle = document.title;
    document.title = preview.title + " · Vendora";
    const tags: Array<{ key: string; attr: "property" | "name"; value: string }> = [
      { key: "og:title", attr: "property", value: preview.title },
      { key: "og:type", attr: "property", value: "website" },
      { key: "og:url", attr: "property", value: window.location.href },
      { key: "og:description", attr: "property", value: preview.description },
      { key: "og:image", attr: "property", value: preview.image },
      { key: "twitter:card", attr: "name", value: "summary_large_image" },
      { key: "twitter:title", attr: "name", value: preview.title },
      { key: "twitter:description", attr: "name", value: preview.description },
      { key: "twitter:image", attr: "name", value: preview.image },
      { key: "description", attr: "name", value: preview.description },
    ];
    const created: HTMLMetaElement[] = [];
    for (const t of tags) {
      if (!t.value) continue;
      let el = document.head.querySelector<HTMLMetaElement>(
        `meta[${t.attr}="${t.key}"]`,
      );
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(t.attr, t.key);
        document.head.appendChild(el);
        created.push(el);
      }
      el.setAttribute("content", t.value);
    }
    return () => {
      document.title = prevTitle;
      // Only remove tags we created; leave any that were pre-existing
      // (e.g. the app shell's defaults) alone.
      for (const el of created) el.remove();
    };
  }, [state]);

  async function submitPassword() {
    if (!passwordInput.trim() || submitting) return;
    setSubmitting(true);
    await resolve(passwordInput);
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />
      <main className="pt-24 pb-16 px-4 md:px-8 max-w-6xl mx-auto">
        {state.status === "loading" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-md" />
            ))}
          </div>
        ) : state.status === "needs_password" ? (
          <div className="max-w-sm mx-auto py-12">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-5 h-5 text-muted-foreground" />
                <h1 className="font-editorial text-xl">Password required</h1>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                This share is password-protected.
              </p>
              <Label htmlFor="share-pw" className="text-xs font-medium text-muted-foreground">
                Password
              </Label>
              <Input
                id="share-pw"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitPassword();
                }}
                autoFocus
                className="mt-1"
              />
              {state.error ? (
                <p className="text-xs text-destructive mt-2">{state.error}</p>
              ) : null}
              <Button
                onClick={submitPassword}
                disabled={submitting || !passwordInput.trim()}
                className="mt-4 w-full rounded-full"
              >
                Unlock
              </Button>
            </div>
          </div>
        ) : state.status === "not_found" ? (
          <div className="text-center py-20">
            <h1 className="font-editorial text-3xl mb-2">Not found</h1>
            <p className="text-sm text-muted-foreground">
              This share link doesn't exist — it may have been revoked.
            </p>
          </div>
        ) : state.status === "expired" ? (
          <div className="text-center py-20">
            <h1 className="font-editorial text-3xl mb-2">Link expired</h1>
            <p className="text-sm text-muted-foreground">
              The vendor set an expiry on this share and it's passed.
            </p>
          </div>
        ) : state.status === "image" ? (
          <SingleImageView image={state.image} />
        ) : (
          <AlbumView
            albumName={state.album_name}
            images={state.images}
            total={state.total}
            hasMore={state.hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            lightboxIdx={lightboxIdx}
            setLightboxIdx={setLightboxIdx}
          />
        )}
      </main>
    </div>
  );
}

function SingleImageView({ image }: { image: ImageRow }) {
  const [downloading, setDownloading] = useState(false);
  return (
    <div className="flex flex-col items-center gap-4">
      <img
        src={image.image_url}
        alt={image.caption ?? "Shared image"}
        className="max-h-[80vh] max-w-full rounded-md"
      />
      <div className="flex items-center gap-3">
        {image.caption ? (
          <p className="text-sm text-muted-foreground">{image.caption}</p>
        ) : null}
        <button
          type="button"
          disabled={downloading}
          onClick={async () => {
            if (downloading) return;
            setDownloading(true);
            try {
              await downloadCrossOrigin(image.image_url);
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Couldn't download.",
              );
            } finally {
              setDownloading(false);
            }
          }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline disabled:opacity-60"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {downloading ? "Downloading…" : "Download"}
        </button>
      </div>
    </div>
  );
}

function AlbumView({
  albumName,
  images,
  total,
  hasMore,
  loadingMore,
  onLoadMore,
  lightboxIdx,
  setLightboxIdx,
}: {
  albumName: string;
  images: ImageRow[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  lightboxIdx: number | null;
  setLightboxIdx: (n: number | null) => void;
}) {
  return (
    <div>
      <h1 className="font-editorial text-3xl mb-2">{albumName}</h1>
      <p className="text-sm text-muted-foreground mb-8">
        {total} image{total === 1 ? "" : "s"}
        {hasMore || images.length < total ? (
          <span className="opacity-70"> · showing {images.length}</span>
        ) : null}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setLightboxIdx(i)}
            className="block group"
          >
            <div className="aspect-square overflow-hidden rounded-md bg-secondary/40">
              <img
                src={`${img.image_url}?width=400&quality=75`}
                alt={img.caption ?? "Shared image"}
                loading="lazy"
                className="w-full h-full object-cover transition group-hover:scale-[1.02]"
              />
            </div>
            {img.caption ? (
              <p className="mt-2 text-xs text-muted-foreground line-clamp-2 text-left">
                {img.caption}
              </p>
            ) : null}
          </button>
        ))}
      </div>
      {hasMore ? (
        <div className="flex justify-center mt-8">
          <Button
            onClick={onLoadMore}
            disabled={loadingMore}
            variant="outline"
            className="rounded-full"
          >
            {loadingMore ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading…
              </>
            ) : (
              `Load more (${total - images.length} left)`
            )}
          </Button>
        </div>
      ) : null}
      {lightboxIdx !== null && images[lightboxIdx] ? (
        <SimpleLightbox
          images={images}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onPrev={() => setLightboxIdx(Math.max(0, lightboxIdx - 1))}
          onNext={() => setLightboxIdx(Math.min(images.length - 1, lightboxIdx + 1))}
        />
      ) : null}
    </div>
  );
}

function SimpleLightbox({
  images,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  images: ImageRow[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const img = images[index];
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="w-5 h-5" />
      </button>
      <button
        type="button"
        disabled={downloading}
        onClick={async (e) => {
          e.stopPropagation();
          if (downloading) return;
          setDownloading(true);
          try {
            await downloadCrossOrigin(img.image_url);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Couldn't download.",
            );
          } finally {
            setDownloading(false);
          }
        }}
        className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5 disabled:opacity-60"
      >
        {downloading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {downloading ? "Downloading…" : "Download"}
      </button>
      <img
        src={img.image_url}
        alt={img.caption ?? "Shared image"}
        className="max-h-[90vh] max-w-[90vw] object-contain rounded-md"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
