// Vendor gallery — account-level media library. Multi-file upload to
// the vendor-gallery storage bucket, grid of thumbnails with
// hover-revealed delete affordance, lightbox on click. Distinct from
// per-listing portfolio (vendor_portfolio_images) — this pool is
// scoped to the user, not the listing.

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { vendorNavItems } from "@/data/navItems";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface GalleryRow {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
}

export default function VendorGalleryPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<GalleryRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vendor_gallery_images")
      .select("id, image_url, caption, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data as GalleryRow[] | null) ?? []);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !user?.id || uploading) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      toast.error("Pick image files only.");
      return;
    }
    // 20 MB per image cap — large enough for high-res phone photos,
    // small enough to keep request bodies reasonable on slow uplinks.
    const TOO_BIG = list.find((f) => f.size > 20 * 1024 * 1024);
    if (TOO_BIG) {
      toast.error(`"${TOO_BIG.name}" is over 20 MB. Try a smaller version.`);
      return;
    }

    setUploading(true);
    setUploadProgress({ done: 0, total: list.length });
    let failed = 0;
    for (const file of list) {
      const ext =
        file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "jpg";
      const filename = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const path = `${user.id}/${filename}`;

      const upload = await supabase.storage
        .from("vendor-gallery")
        .upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
      if (upload.error) {
        failed += 1;
        console.error("[gallery] upload failed", file.name, upload.error);
        setUploadProgress((p) => ({ ...p, done: p.done + 1 }));
        continue;
      }

      const { data: pub } = supabase.storage
        .from("vendor-gallery")
        .getPublicUrl(path);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await (supabase as any)
        .from("vendor_gallery_images")
        .insert({
          user_id: user.id,
          image_url: pub.publicUrl,
          caption: null,
        });
      if (insErr) {
        failed += 1;
        // DB write failed → undo the storage upload to avoid orphan files.
        supabase.storage
          .from("vendor-gallery")
          .remove([path])
          .then(({ error: rmErr }) => {
            if (rmErr) {
              console.error("[gallery] failed to clean up orphan upload", path, rmErr);
            }
          });
      }
      setUploadProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setUploading(false);
    if (failed > 0) {
      toast.error(
        `${list.length - failed} uploaded, ${failed} failed. Check console.`,
      );
    } else {
      toast.success(`${list.length} image${list.length === 1 ? "" : "s"} added.`);
    }
    await load();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this image? Can't be undone.")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_gallery_images")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted.");
    load();
  }

  function openPicker() {
    fileInputRef.current?.click();
  }

  return (
    <div className="min-h-screen vendor-canvas flex">
      <DashboardSidebar
        items={vendorNavItems}
        title="Vendor Portal"
        backPath="/vendor/me"
      />
      <main className="flex-1 pb-24 md:pb-0">
        <div className="backdrop-blur-sm px-4 md:px-8 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-editorial text-3xl">Gallery</h1>
              <p className="text-sm text-muted-foreground">
                Your media library. Upload once, reuse across listings.
              </p>
            </div>
            <NotificationBell variant="light" />
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {rows === null
                ? "Loading…"
                : rows.length === 0
                  ? "No images yet."
                  : `${rows.length} image${rows.length === 1 ? "" : "s"}`}
            </p>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button onClick={openPicker} disabled={uploading} className="rounded-full">
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Uploading {uploadProgress.done}/{uploadProgress.total}
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-4 w-4 mr-1.5" />
                    Upload images
                  </>
                )}
              </Button>
            </div>
          </div>

          {rows === null ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <button
              type="button"
              onClick={openPicker}
              disabled={uploading}
              className="w-full rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center hover:bg-card/60 transition-colors disabled:opacity-60"
            >
              <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">
                Drop images here or tap to upload
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                JPG, PNG, WebP. Up to 20 MB each.
              </p>
            </button>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {rows.map((r, i) => (
                <div key={r.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => setLightboxIdx(i)}
                    className="block w-full"
                  >
                    <div className="aspect-square overflow-hidden rounded-md bg-secondary/40">
                      <img
                        src={r.image_url}
                        alt={r.caption ?? "Gallery image"}
                        loading="lazy"
                        className="w-full h-full object-cover transition group-hover:scale-[1.02]"
                      />
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(r.id);
                    }}
                    aria-label="Delete image"
                    className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <MobileNav items={vendorNavItems} />

      {lightboxIdx !== null && rows && rows[lightboxIdx] ? (
        <Lightbox
          rows={rows}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onPrev={() => setLightboxIdx((i) => (i === null ? null : Math.max(0, i - 1)))}
          onNext={() =>
            setLightboxIdx((i) =>
              i === null ? null : Math.min(rows.length - 1, i + 1),
            )
          }
        />
      ) : null}
    </div>
  );
}

function Lightbox({
  rows,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  rows: GalleryRow[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const row = rows[index];
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
      <img
        src={row.image_url}
        alt={row.caption ?? "Gallery image"}
        className="max-h-[90vh] max-w-[90vw] object-contain rounded-md"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
