// In-app editor for a gallery image. v1 covers rotate 90° (either
// direction) + flip horizontal + flip vertical. Renders a live
// canvas preview; on save, exports the canvas to a blob, uploads
// a new file to the vendor-gallery bucket, updates the row's
// image_url, and removes the old file. blurhash + dimensions are
// recomputed since they're now stale.

import { useEffect, useRef, useState } from "react";
import {
  FlipHorizontal,
  FlipVertical,
  Loader2,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { computeBlurhash } from "@/lib/galleryImage";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageId: string;
  imageUrl: string;
  onSaved: () => void;
}

interface Transform {
  rotate: number; // 0 | 90 | 180 | 270
  flipH: boolean;
  flipV: boolean;
}

export function EditModal({ open, onOpenChange, imageId, imageUrl, onSaved }: Props) {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const [t, setT] = useState<Transform>({ rotate: 0, flipH: false, flipV: false });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setT({ rotate: 0, flipH: false, flipV: false });
    setLoaded(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      sourceRef.current = img;
      setLoaded(true);
    };
    img.onerror = () => {
      toast.error("Couldn't load image for editing.");
      onOpenChange(false);
    };
    img.src = imageUrl;
  }, [open, imageUrl, onOpenChange]);

  // Re-render canvas whenever the transform changes or the source loads.
  useEffect(() => {
    if (!loaded || !sourceRef.current || !canvasRef.current) return;
    drawTo(canvasRef.current, sourceRef.current, t, 600);
  }, [t, loaded]);

  async function save() {
    if (!user?.id || !sourceRef.current) return;
    setSaving(true);
    try {
      // Render at full source resolution for the upload.
      const exportCanvas = document.createElement("canvas");
      drawTo(exportCanvas, sourceRef.current, t);
      const blob: Blob | null = await new Promise((resolve) =>
        exportCanvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("Couldn't encode the edited image.");

      // Upload the new file under the same user folder.
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const path = `${user.id}/${filename}`;
      const upload = await supabase.storage
        .from("vendor-gallery")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upload.error) throw upload.error;
      const { data: pub } = supabase.storage
        .from("vendor-gallery")
        .getPublicUrl(path);

      // Recompute blurhash + dimensions for the new file.
      const blurInfo = await computeBlurhash(
        new File([blob], filename, { type: "image/jpeg" }),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updErr } = await (supabase as any)
        .from("vendor_gallery_images")
        .update({
          image_url: pub.publicUrl,
          width: blurInfo?.width ?? exportCanvas.width,
          height: blurInfo?.height ?? exportCanvas.height,
          blurhash: blurInfo?.blurhash ?? null,
          // EXIF is wiped — the rotated/flipped image is no longer
          // the original; the camera metadata is stale.
          exif: null,
        })
        .eq("id", imageId);
      if (updErr) throw updErr;

      // Best-effort cleanup of the old storage object. The path we
      // had is encoded in the old URL.
      const oldPath = extractStoragePath(imageUrl);
      if (oldPath) {
        void supabase.storage.from("vendor-gallery").remove([oldPath]);
      }

      toast.success("Saved.");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't save edit.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function rotateBy(deg: number) {
    setT((p) => ({ ...p, rotate: ((p.rotate + deg) % 360 + 360) % 360 }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-editorial text-2xl">Edit image</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-secondary/40 rounded-lg p-3 flex items-center justify-center min-h-[300px]">
            {!loaded ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              <canvas
                ref={canvasRef}
                className="max-h-[60vh] max-w-full rounded-md"
              />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => rotateBy(-90)}
              className="rounded-full"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Rotate L
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => rotateBy(90)}
              className="rounded-full"
            >
              <RotateCw className="w-3.5 h-3.5 mr-1.5" />
              Rotate R
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setT((p) => ({ ...p, flipH: !p.flipH }))}
              className="rounded-full"
            >
              <FlipHorizontal className="w-3.5 h-3.5 mr-1.5" />
              Flip H
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setT((p) => ({ ...p, flipV: !p.flipV }))}
              className="rounded-full"
            >
              <FlipVertical className="w-3.5 h-3.5 mr-1.5" />
              Flip V
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !loaded} className="rounded-full">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function drawTo(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  t: Transform,
  maxSize?: number,
): void {
  const rotated = t.rotate === 90 || t.rotate === 270;
  const naturalW = rotated ? img.naturalHeight : img.naturalWidth;
  const naturalH = rotated ? img.naturalWidth : img.naturalHeight;
  let W = naturalW;
  let H = naturalH;
  if (maxSize) {
    // Fit within maxSize for preview rendering.
    const scale = Math.min(maxSize / W, maxSize / H, 1);
    W = Math.round(W * scale);
    H = Math.round(H * scale);
  }
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate((t.rotate * Math.PI) / 180);
  const scaleX = t.flipH ? -1 : 1;
  const scaleY = t.flipV ? -1 : 1;
  ctx.scale(scaleX, scaleY);
  // After rotation, the image's "drawing" dimensions are the source
  // intrinsic w/h (not the rotated bounds).
  const drawW = rotated ? H : W;
  const drawH = rotated ? W : H;
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function extractStoragePath(publicUrl: string): string | null {
  const m = publicUrl.match(/\/storage\/v1\/object\/public\/vendor-gallery\/(.+?)(?:\?.*)?$/);
  return m ? m[1] : null;
}
