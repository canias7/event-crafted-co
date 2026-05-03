import { useEffect, useRef, useState } from "react";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const BUCKET = "vendor-portfolios";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGES = 10;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

interface PortfolioImage {
  id: string;
  storage_path: string;
  caption: string | null;
  display_order: number;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const portfolioTable = () => (supabase as any).from("vendor_portfolio_images");

interface Props {
  vendorId: string;
}

export function PortfolioUploader({ vendorId }: Props) {
  const [images, setImages] = useState<PortfolioImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await portfolioTable()
      .select("id, storage_path, caption, display_order, created_at")
      .eq("vendor_id", vendorId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(`Couldn't load portfolio: ${error.message}`);
      setImages([]);
    } else {
      setImages((data as PortfolioImage[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  function publicUrl(path: string) {
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function uploadFiles(fileList: FileList) {
    const files = Array.from(fileList);
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast.error(`You can have at most ${MAX_IMAGES} portfolio images.`);
      return;
    }
    const accepted = files.slice(0, remaining).filter((f) => {
      if (!ACCEPTED.includes(f.type)) {
        toast.error(`${f.name}: only JPG, PNG, or WEBP`);
        return false;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name}: max 5 MB`);
        return false;
      }
      return true;
    });
    if (accepted.length === 0) return;

    setUploading(true);
    const startOrder =
      images.reduce((m, im) => Math.max(m, im.display_order), -1) + 1;

    let succeeded = 0;
    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i];
      const ext = file.name.split(".").pop() ?? "jpg";
      const filename = `${crypto.randomUUID()}.${ext.toLowerCase()}`;
      const path = `${vendorId}/${filename}`;

      const upload = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: "3600" });
      if (upload.error) {
        toast.error(`${file.name}: ${upload.error.message}`);
        continue;
      }

      const insert = await portfolioTable().insert({
        vendor_id: vendorId,
        storage_path: path,
        display_order: startOrder + i,
      });
      if (insert.error) {
        // Best-effort cleanup of the orphaned blob.
        await supabase.storage.from(BUCKET).remove([path]);
        toast.error(`${file.name}: ${insert.error.message}`);
        continue;
      }
      succeeded++;
    }

    setUploading(false);
    if (succeeded > 0) {
      toast.success(
        `${succeeded} ${succeeded === 1 ? "image" : "images"} uploaded`,
      );
      load();
    }
  }

  async function deleteImage(img: PortfolioImage) {
    setDeletingId(img.id);
    const { error: storageErr } = await supabase.storage
      .from(BUCKET)
      .remove([img.storage_path]);
    // Even if storage delete fails (orphan), remove the metadata row so the
    // UI stays consistent — the image won't render anyway.
    const { error: rowErr } = await portfolioTable()
      .delete()
      .eq("id", img.id);
    setDeletingId(null);
    if (rowErr) {
      toast.error(rowErr.message);
      return;
    }
    if (storageErr) {
      toast.warning("Removed from portfolio (storage cleanup may lag)");
    }
    setImages((prev) => prev.filter((p) => p.id !== img.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-label text-muted-foreground">Portfolio images</p>
          <p className="text-xs text-muted-foreground mt-1">
            JPG, PNG, or WEBP · up to 5 MB each · max {MAX_IMAGES} images
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={uploading || images.length >= MAX_IMAGES}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Add photos
            </>
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              uploadFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-square bg-muted rounded-sm animate-pulse"
            />
          ))}
        </div>
      ) : images.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full border border-dashed border-border rounded-sm p-10 text-center hover:border-foreground/30 transition-colors"
        >
          <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium mb-1">No photos yet</p>
          <p className="text-xs text-muted-foreground">
            Add 3–5 images that show your range and style.
          </p>
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img) => (
            <div
              key={img.id}
              className="relative group aspect-square overflow-hidden rounded-sm bg-muted"
            >
              <img
                src={publicUrl(img.storage_path)}
                alt={img.caption ?? "Portfolio image"}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <button
                type="button"
                onClick={() => deleteImage(img)}
                disabled={deletingId === img.id}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-foreground/85 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm disabled:opacity-100"
                aria-label="Delete image"
              >
                {deletingId === img.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
