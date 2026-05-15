import { useEffect, useMemo, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Download, Heart, ChevronLeft, ChevronRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { transformedImageUrl } from "@/lib/storage";
import { PrefetchLink as Link } from "@/components/shared/PrefetchLink";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const BUCKET = "event-albums";

interface AlbumData {
  album: {
    id: string;
    title: string;
    description: string | null;
    cover_path: string | null;
    download_enabled: boolean;
    published_at: string;
    vendor_id: string;
    vendor_name: string;
  };
  photos: Array<{
    id: string;
    storage_path: string;
    caption: string | null;
    taken_at: string | null;
  }>;
}

function publicUrl(
  path: string,
  opts?: { width?: number; quality?: number },
) {
  // The bucket is private, but the policy auto-grants read on photos in
  // published-with-consent albums. transformedImageUrl just constructs the
  // URL string — Supabase enforces the read at the storage edge.
  return transformedImageUrl(BUCKET, path, opts);
}

export default function EventAlbumPage() {
  const { token } = useParams();
  const [data, setData] = useState<AlbumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error } = await (supabase as any).rpc(
        "get_album_by_token",
        { p_token: token },
      );
      if (cancelled) return;
      if (error || !result) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setData(result as AlbumData);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useDocumentMeta({
    title: data ? `${data.album.title} — Vendora album` : "Event album — Vendora",
    description: data?.album.description ?? "An event album shared on Vendora.",
    image: data?.album.cover_path
      ? publicUrl(data.album.cover_path, { width: 1200 })
      : undefined,
    type: "article",
  });

  // Keyboard nav for lightbox.
  useEffect(() => {
    if (lightboxIndex === null || !data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight")
        setLightboxIndex((i) => (i === null ? 0 : Math.min(i + 1, data.photos.length - 1)));
      if (e.key === "ArrowLeft")
        setLightboxIndex((i) => (i === null ? 0 : Math.max(i - 1, 0)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, data]);

  const dateLabel = useMemo(() => {
    if (!data?.album.published_at) return null;
    return new Date(data.album.published_at).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [data]);

  async function downloadOne(path: string, suggestedName?: string) {
    setDownloading(path);
    try {
      const url = publicUrl(path);
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = suggestedName ?? path.split("/").pop() ?? "photo.jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(null);
    }
  }

  if (notFound) return <Navigate to="/" replace />;

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-background">
        <section className="h-[50vh]">
          <Skeleton className="w-full h-full rounded-none" />
        </section>
        <div className="container mx-auto px-6 py-8 max-w-5xl space-y-3">
          <Skeleton className="h-10 w-1/2" />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <section className="relative h-[55svh] min-h-[420px] w-full overflow-hidden">
        {data.album.cover_path ? (
          <img
            src={publicUrl(data.album.cover_path, { width: 1600 })}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-foreground/85 to-foreground/50" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/45 via-foreground/15 to-background" />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="font-editorial text-5xl md:text-6xl text-background leading-[1.05] mb-3 max-w-3xl"
          >
            {data.album.title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-sm md:text-base text-background/80"
          >
            <span>{data.photos.length} {data.photos.length === 1 ? "photo" : "photos"}</span>
            {dateLabel && <span> · published {dateLabel}</span>}
          </motion.p>
          {data.album.description && (
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="text-sm md:text-base text-background/85 mt-5 max-w-xl leading-relaxed"
            >
              {data.album.description}
            </motion.p>
          )}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-xs uppercase tracking-[0.3em] text-background/65 mt-6"
          >
            By{" "}
            <Link
              to={`/vendors/${data.album.vendor_id}`}
              className="hover:text-background underline-offset-4 hover:underline"
            >
              {data.album.vendor_name}
            </Link>
          </motion.p>
        </div>
      </section>

      {/* Gallery */}
      <section className="py-10 md:py-14 flex-1">
        <div className="container mx-auto px-6 max-w-7xl">
          {data.photos.length === 0 ? (
            <div className="text-center text-muted-foreground py-20">
              No photos yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {data.photos.map((p, i) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setLightboxIndex(i)}
                  className="aspect-square rounded-sm overflow-hidden bg-muted relative group block"
                  aria-label={`Open photo ${i + 1}`}
                >
                  <img
                    src={publicUrl(p.storage_path, { width: 600 })}
                    alt={p.caption ?? ""}
                    loading={i < 8 ? "eager" : "lazy"}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                  {data.album.download_enabled && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadOne(p.storage_path);
                      }}
                      className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-foreground/85 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-foreground"
                      aria-label="Download photo"
                    >
                      {downloading === p.storage_path ? (
                        <span className="w-3 h-3 border-2 border-background border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-muted-foreground border-t border-border">
        <p className="flex items-center justify-center gap-1.5">
          Made with
          <Heart className="w-3 h-3 fill-current text-accent" />
          on
          <Link to="/" className="font-display text-foreground/85 hover:underline">
            Vendora
          </Link>
        </p>
      </footer>

      {/* Lightbox */}
      {lightboxIndex !== null && data.photos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-foreground/95 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-background/15 hover:bg-background/30 text-background flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          {lightboxIndex > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => (i ?? 0) - 1);
              }}
              className="absolute left-4 w-10 h-10 rounded-full bg-background/15 hover:bg-background/30 text-background flex items-center justify-center"
              aria-label="Previous"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {lightboxIndex < data.photos.length - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => (i ?? 0) + 1);
              }}
              className="absolute right-4 w-10 h-10 rounded-full bg-background/15 hover:bg-background/30 text-background flex items-center justify-center"
              aria-label="Next"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
          <img
            src={publicUrl(data.photos[lightboxIndex].storage_path, { width: 1600 })}
            alt={data.photos[lightboxIndex].caption ?? ""}
            className="max-w-[92vw] max-h-[88vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {data.album.download_enabled && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadOne(data.photos[lightboxIndex].storage_path);
                }}
                className="rounded-full bg-background text-foreground hover:bg-background/90"
                disabled={downloading === data.photos[lightboxIndex].storage_path}
              >
                {downloading === data.photos[lightboxIndex].storage_path ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-foreground border-t-transparent rounded-full animate-spin mr-2" />
                    Downloading…
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 mr-2" />
                    Download HD
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
