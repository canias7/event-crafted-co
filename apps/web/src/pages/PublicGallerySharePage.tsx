// Public viewer for vendor-gallery share tokens at /g/:token.
// Calls the resolve_gallery_share RPC; if the share has a password,
// prompts for it before resolving the underlying image/album.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Lock, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicNav } from "@/components/public/PublicNav";

interface ResolvedShare {
  id: string;
  image_id: string | null;
  album_id: string | null;
  expires_at: string | null;
}

interface ImageRow {
  id: string;
  image_url: string;
  caption: string | null;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

interface AlbumRow {
  id: string;
  name: string;
}

type State =
  | { status: "loading" }
  | { status: "needs_password"; error?: string }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "image"; image: ImageRow }
  | { status: "album"; album: AlbumRow; images: ImageRow[] };

export default function PublicGallerySharePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ status: "loading" });
  const [passwordInput, setPasswordInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const resolve = useCallback(
    async (password: string | null) => {
      if (!token) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("resolve_gallery_share", {
        p_token: token,
        p_password: password,
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
      // resolve_gallery_share returns at most one row in our shape.
      const row = (Array.isArray(data) ? data[0] : data) as ResolvedShare | undefined;
      if (!row) {
        setState({ status: "not_found" });
        return;
      }

      if (row.image_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: img } = await (supabase as any)
          .from("vendor_gallery_images")
          .select("id, image_url, caption, blurhash, width, height, created_at")
          .eq("id", row.image_id)
          .is("deleted_at", null)
          .maybeSingle();
        if (!img) {
          setState({ status: "not_found" });
          return;
        }
        setState({ status: "image", image: img as ImageRow });
      } else if (row.album_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [albRes, imgRes] = await Promise.all([
          (supabase as any)
            .from("vendor_gallery_albums")
            .select("id, name")
            .eq("id", row.album_id)
            .maybeSingle(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("vendor_gallery_images")
            .select("id, image_url, caption, blurhash, width, height, created_at")
            .eq("album_id", row.album_id)
            .is("deleted_at", null)
            .order("display_order", { ascending: true })
            .order("created_at", { ascending: false }),
        ]);
        if (!albRes.data) {
          setState({ status: "not_found" });
          return;
        }
        setState({
          status: "album",
          album: albRes.data as AlbumRow,
          images: (imgRes.data as ImageRow[] | null) ?? [],
        });
      }
    },
    [token],
  );

  useEffect(() => {
    void resolve(null);
  }, [resolve]);

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
            album={state.album}
            images={state.images}
            lightboxIdx={lightboxIdx}
            setLightboxIdx={setLightboxIdx}
          />
        )}
      </main>
    </div>
  );
}

function SingleImageView({ image }: { image: ImageRow }) {
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
        <a
          href={image.image_url}
          download
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <Download className="w-4 h-4" />
          Download
        </a>
      </div>
    </div>
  );
}

function AlbumView({
  album,
  images,
  lightboxIdx,
  setLightboxIdx,
}: {
  album: AlbumRow;
  images: ImageRow[];
  lightboxIdx: number | null;
  setLightboxIdx: (n: number | null) => void;
}) {
  return (
    <div>
      <h1 className="font-editorial text-3xl mb-2">{album.name}</h1>
      <p className="text-sm text-muted-foreground mb-8">
        {images.length} image{images.length === 1 ? "" : "s"}
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
      <a
        href={img.image_url}
        download
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5"
      >
        <Download className="w-4 h-4" />
        Download
      </a>
      <img
        src={img.image_url}
        alt={img.caption ?? "Shared image"}
        className="max-h-[90vh] max-w-[90vw] object-contain rounded-md"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
