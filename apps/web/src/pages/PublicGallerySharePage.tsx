// Public viewer for vendor-gallery share tokens at /g/:token.
// Uses get_share_payload — a SECURITY DEFINER RPC that validates
// the token + optional password, then returns the share kind +
// image_url / caption / blurhash / width / height for the
// underlying image(s). EXIF + file_size_bytes are intentionally
// withheld; vendor_gallery_images / _albums no longer have
// public-read RLS, so this RPC is the only public path.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Lock, X } from "lucide-react";
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
}

type State =
  | { status: "loading" }
  | { status: "needs_password"; error?: string }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "image"; image: ImageRow }
  | { status: "album"; album_name: string; images: ImageRow[] };

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
      const { data, error } = await (supabase as any).rpc("get_share_payload", {
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
      const payload = data as SharePayload | null;
      if (!payload) {
        setState({ status: "not_found" });
        return;
      }

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
            albumName={state.album_name}
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
        <button
          type="button"
          onClick={async () => {
            try {
              await downloadCrossOrigin(image.image_url);
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Couldn't download.",
              );
            }
          }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
      </div>
    </div>
  );
}

function AlbumView({
  albumName,
  images,
  lightboxIdx,
  setLightboxIdx,
}: {
  albumName: string;
  images: ImageRow[];
  lightboxIdx: number | null;
  setLightboxIdx: (n: number | null) => void;
}) {
  return (
    <div>
      <h1 className="font-editorial text-3xl mb-2">{albumName}</h1>
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
      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await downloadCrossOrigin(img.image_url);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Couldn't download.",
            );
          }
        }}
        className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5"
      >
        <Download className="w-4 h-4" />
        Download
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
