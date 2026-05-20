// In-app editor for a gallery image. Rotate (90° L/R), flip (H/V),
// and crop (drag-to-select via react-image-crop).
//
// To make rotate + crop coexist correctly, the displayed image is
// rasterized through the current transform whenever it changes —
// that "transformed display URL" becomes the <img> inside ReactCrop.
// The crop selection is then in coordinates of the already-rotated
// image, no inverse-rotation math needed. On save, the export
// canvas mirrors this: source → transform → crop, all in one pass
// at full source resolution.
//
// EXIF preservation: rotate-only / flip-only edits keep the row's
// existing exif jsonb (camera/lens/date are still valid). Cropping
// clears exif since the image is materially different.

import { useEffect, useRef, useState } from "react";
import {
  FlipHorizontal,
  FlipVertical,
  Loader2,
  RotateCcw,
  RotateCw,
  Scissors,
} from "lucide-react";
import { toast } from "sonner";
import ReactCrop, {
  type Crop,
  type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
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
import {
  computeBlurhash,
  type SanitizedExif,
} from "@/lib/galleryImage";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageId: string;
  imageUrl: string;
  originalExif: SanitizedExif | null;
  onSaved: () => void;
}

interface Transform {
  rotate: number;
  flipH: boolean;
  flipV: boolean;
}

export function EditModal({
  open,
  onOpenChange,
  imageId,
  imageUrl,
  originalExif,
  onSaved,
}: Props) {
  const { user } = useAuth();
  // The raw source image, loaded once when the modal opens.
  const sourceRef = useRef<HTMLImageElement | null>(null);
  // The transformed display URL — what ReactCrop sees. Rebuilt
  // whenever the transform changes.
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  const [t, setT] = useState<Transform>({ rotate: 0, flipH: false, flipV: false });
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) {
      setT({ rotate: 0, flipH: false, flipV: false });
      setCrop(undefined);
      setCompletedCrop(null);
      setDisplayUrl(null);
      setLoaded(false);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      sourceRef.current = img;
      setDisplayUrl(imageUrl); // identity transform: just point at the original URL
      setLoaded(true);
    };
    img.onerror = () => {
      toast.error("Couldn't load image for editing.");
      onOpenChange(false);
    };
    img.src = imageUrl;
  }, [open, imageUrl, onOpenChange]);

  // Re-rasterize the source with the current transform whenever it
  // changes. Identity transform short-circuits to the original URL
  // (no decode hit; ReactCrop will reload the same image).
  useEffect(() => {
    if (!open || !sourceRef.current) return;
    const src = sourceRef.current;
    if (t.rotate === 0 && !t.flipH && !t.flipV) {
      setDisplayUrl(imageUrl);
      setCrop(undefined);
      setCompletedCrop(null);
      return;
    }
    const canvas = renderTransformed(src, t);
    // Reset the crop since the display coords just changed under it.
    setCrop(undefined);
    setCompletedCrop(null);
    setDisplayUrl(canvas.toDataURL("image/jpeg", 0.92));
  }, [t, imageUrl, open]);

  function rotateBy(deg: number) {
    setT((p) => ({ ...p, rotate: ((p.rotate + deg) % 360 + 360) % 360 }));
  }

  function resetCrop() {
    setCrop(undefined);
    setCompletedCrop(null);
  }

  async function save() {
    if (!user?.id || !sourceRef.current) return;
    setSaving(true);
    try {
      const src = sourceRef.current;
      // First pass: render source through the current transform at
      // full natural resolution. This is the same canvas the
      // displayed thumbnail was generated from, but unscaled.
      const baseCanvas = renderTransformed(src, t);

      // Second pass: crop. completedCrop's coords are in CSS pixels
      // of the displayed (already-transformed) image. Scale to
      // baseCanvas dimensions.
      let outCanvas = baseCanvas;
      if (
        completedCrop &&
        completedCrop.width > 0 &&
        completedCrop.height > 0 &&
        cropImgRef.current
      ) {
        const displayed = cropImgRef.current;
        const sx = baseCanvas.width / displayed.width;
        const sy = baseCanvas.height / displayed.height;
        const cropX = Math.round(completedCrop.x * sx);
        const cropY = Math.round(completedCrop.y * sy);
        const cropW = Math.round(completedCrop.width * sx);
        const cropH = Math.round(completedCrop.height * sy);
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const ctx = cropCanvas.getContext("2d");
        if (!ctx) throw new Error("Couldn't get a 2D context.");
        ctx.drawImage(baseCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        outCanvas = cropCanvas;
      }

      const blob: Blob | null = await new Promise((resolve) =>
        outCanvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("Couldn't encode the edited image.");

      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const path = `${user.id}/${filename}`;
      const upload = await supabase.storage
        .from("vendor-gallery")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upload.error) throw upload.error;
      const { data: pub } = supabase.storage
        .from("vendor-gallery")
        .getPublicUrl(path);

      const blurInfo = await computeBlurhash(
        new File([blob], filename, { type: "image/jpeg" }),
      );

      // Preserve EXIF on transform-only edits — the camera / lens /
      // capture date are still accurate. Drop EXIF on crop, since
      // the image is now a meaningfully different framing.
      const cropped =
        completedCrop && completedCrop.width > 0 && completedCrop.height > 0;
      const nextExif = cropped ? null : originalExif;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updErr } = await (supabase as any)
        .from("vendor_gallery_images")
        .update({
          image_url: pub.publicUrl,
          width: blurInfo?.width ?? outCanvas.width,
          height: blurInfo?.height ?? outCanvas.height,
          blurhash: blurInfo?.blurhash ?? null,
          file_size_bytes: blob.size,
          exif: nextExif,
        })
        .eq("id", imageId);
      if (updErr) throw updErr;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-editorial text-2xl">Edit image</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-secondary/40 rounded-lg p-3 flex items-center justify-center min-h-[300px]">
            {!loaded || !displayUrl ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                keepSelection
              >
                <img
                  ref={cropImgRef}
                  src={displayUrl}
                  alt="Edit"
                  crossOrigin="anonymous"
                  className="max-h-[60vh] max-w-full rounded-md"
                />
              </ReactCrop>
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
            {completedCrop && completedCrop.width > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={resetCrop}
                className="rounded-full"
              >
                <Scissors className="w-3.5 h-3.5 mr-1.5" />
                Reset crop
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-center text-muted-foreground">
            Drag on the image to crop. Rotate / flip refresh the crop area
            since they change what's visible.
          </p>
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

// Draw `img` to a fresh canvas at full natural resolution, applying
// rotate + flip. Returns the canvas; caller can crop / export from
// it. For rotate=0 + no flips, this is essentially a copy.
function renderTransformed(img: HTMLImageElement, t: Transform): HTMLCanvasElement {
  const rotated = t.rotate === 90 || t.rotate === 270;
  const W = rotated ? img.naturalHeight : img.naturalWidth;
  const H = rotated ? img.naturalWidth : img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate((t.rotate * Math.PI) / 180);
  ctx.scale(t.flipH ? -1 : 1, t.flipV ? -1 : 1);
  const drawW = rotated ? H : W;
  const drawH = rotated ? W : H;
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
  return canvas;
}

function extractStoragePath(publicUrl: string): string | null {
  const m = publicUrl.match(/vendor-gallery\/([^?]+)/);
  return m ? m[1] : null;
}
