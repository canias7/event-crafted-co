// Public viewer for vendor-gallery share tokens at /g/:token.
// Resolves the share row (single image OR whole album), checks
// expiry, renders the image(s). No auth required.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicNav } from "@/components/public/PublicNav";

interface ShareRow {
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

export default function PublicGallerySharePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "not_found" }
    | { status: "expired" }
    | { status: "image"; image: ImageRow }
    | { status: "album"; album: AlbumRow; images: ImageRow[] }
  >({ status: "loading" });
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: share, error } = await (supabase as any)
      .from("vendor_gallery_shares")
      .select("id, image_id, album_id, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (error || !share) {
      setState({ status: "not_found" });
      return;
    }
    const s = share as ShareRow;
    if (s.expires_at && new Date(s.expires_at).getTime() < Date.now()) {
      setState({ status: "expired" });
      return;
    }

    if (s.image_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: img } = await (supabase as any)
        .from("vendor_gallery_images")
        .select("id, image_url, caption, blurhash, width, height, created_at")
        .eq("id", s.image_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!img) {
        setState({ status: "not_found" });
        return;
      }
      setState({ status: "image", image: img as ImageRow });
      return;
    }

    if (s.album_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [albRes, imgRes] = await Promise.all([
        (supabase as any)
          .from("vendor_gallery_albums")
          .select("id, name")
          .eq("id", s.album_id)
          .maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("vendor_gallery_images")
          .select("id, image_url, caption, blurhash, width, height, created_at")
          .eq("album_id", s.album_id)
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
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

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
