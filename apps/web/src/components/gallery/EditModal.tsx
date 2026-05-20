// In-app editor for a gallery image. v2 covers rotate 90° (either
// direction) + flip H/V + free-form crop via react-image-crop. On
// save, the canvas is rendered at full source resolution applying
// the crop bounds (if any) and the rotate/flip transform, exported
// to JPEG, uploaded as a new file, and the row's image_url +
// width/height/blurhash get updated. EXIF is cleared since the
// image is no longer a faithful copy of the original capture.

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
import { computeBlurhash } from "@/lib/galleryImage";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageId: string;
  imageUrl: string;
  onSaved: () => void;
}

interface Transform {
  rotate: number;
  flipH: boolean;
  flipV: boolean;
}

export function EditModal({ open, onOpenChange, imageId, imageUrl, onSaved }: Props) {
  const { user } = useAuth();
  const imgRef = useRef<HTMLImageElement | null>(null);
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
      setLoaded(false);
    }
  }, [open]);

  function rotateBy(deg: number) {
    setT((p) => ({ ...p, rotate: ((p.rotate + deg) % 360 + 360) % 360 }));
  }

  function resetCrop() {
    setCrop(undefined);
    setCompletedCrop(null);
  }

  async function save() {
    if (!user?.id || !imgRef.current) return;
    setSaving(true);
    try {
      // Build the export canvas at full source resolution applying
      // crop (if user dragged one) + rotate + flip.
      const src = imgRef.current;
      const natW = src.naturalWidth;
      const natH = src.naturalHeight;

      // Determine source rectangle to draw from. ReactCrop reports
      // completedCrop in image *display* pixels — scale to natural.
      let cropX = 0;
      let cropY = 0;
      let cropW = natW;
      let cropH = natH;
      if (completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
        const sx = natW / src.width;
        const sy = natH / src.height;
        cropX = Math.round(completedCrop.x * sx);
        cropY = Math.round(completedCrop.y * sy);
        cropW = Math.round(completedCrop.width * sx);
        cropH = Math.round(completedCrop.height * sy);
      }

      const rotated = t.rotate === 90 || t.rotate === 270;
      const outW = rotated ? cropH : cropW;
      const outH = rotated ? cropW : cropH;

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Couldn't get a 2D context.");
      ctx.save();
      ctx.translate(outW / 2, outH / 2);
      ctx.rotate((t.rotate * Math.PI) / 180);
      ctx.scale(t.flipH ? -1 : 1, t.flipV ? -1 : 1);
      ctx.drawImage(
        src,
        cropX,
        cropY,
        cropW,
        cropH,
        -cropW / 2,
        -cropH / 2,
        cropW,
        cropH,
      );
      ctx.restore();

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updErr } = await (supabase as any)
        .from("vendor_gallery_images")
        .update({
          image_url: pub.publicUrl,
          width: blurInfo?.width ?? canvas.width,
          height: blurInfo?.height ?? canvas.height,
          blurhash: blurInfo?.blurhash ?? null,
          exif: null,
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

  // Preview filter style applying the current transform to the
  // <img> the user is cropping over. ReactCrop draws its overlay on
  // top of the underlying img element; rotating it in CSS keeps the
  // crop selection visually aligned with the transform.
  const transformStyle = {
    transform: `rotate(${t.rotate}deg) scale(${t.flipH ? -1 : 1}, ${t.flipV ? -1 : 1})`,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-editorial text-2xl">Edit image</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-secondary/40 rounded-lg p-3 flex items-center justify-center min-h-[300px]">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              keepSelection
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Edit"
                crossOrigin="anonymous"
                style={transformStyle}
                className="max-h-[60vh] max-w-full rounded-md"
                onLoad={() => setLoaded(true)}
              />
            </ReactCrop>
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
            Drag on the image to crop. Rotate / flip apply after the
            crop bounds.
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

function extractStoragePath(publicUrl: string): string | null {
  const m = publicUrl.match(/\/storage\/v1\/object\/public\/vendor-gallery\/(.+?)(?:\?.*)?$/);
  return m ? m[1] : null;
}
