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
import { flushSync } from "react-dom";
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
import { formatBytes, loadImageViaBlob } from "@/lib/downloadImage";
import { removeGalleryFileWithRetry } from "@/lib/galleryStorage";
import { captureException } from "@/lib/sentry";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageId: string;
  imageUrl: string;
  onSaved: () => void;
}

// Preview rendered for ReactCrop is downscaled when the source is
// larger than this. Saves the user's RAM on phones (a 24MP image
// would otherwise become a ~7MB base64 data URL just for display).
const PREVIEW_MAX_WIDTH = 1500;

// Output format resolver. Canvas.toBlob natively encodes only
// jpeg/png/webp, so HEIC/AVIF/GIF originals (anything iPhone Safari
// can decode but the browser canvas can't encode back) fall through
// to JPEG. We surface that downgrade with an upfront toast so the
// user isn't surprised by a quality / format change post-save.
interface OutputFormat {
  mime: string;
  ext: string;
  quality: number | undefined;
}
function pickOutputFormat(url: string): OutputFormat {
  const noQuery = url.split("?")[0];
  const dot = noQuery.lastIndexOf(".");
  const ext = dot > 0 ? noQuery.slice(dot + 1).toLowerCase() : "";
  if (ext === "png") return { mime: "image/png", ext: "png", quality: undefined };
  if (ext === "webp") return { mime: "image/webp", ext: "webp", quality: 0.92 };
  // jpg / jpeg / heic / avif / gif / unknown → JPEG.
  return { mime: "image/jpeg", ext: "jpg", quality: 0.92 };
}
function isCanvasNativeFormat(url: string): boolean {
  const noQuery = url.split("?")[0];
  const dot = noQuery.lastIndexOf(".");
  const ext = dot > 0 ? noQuery.slice(dot + 1).toLowerCase() : "";
  return ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp";
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
  const [loadProgress, setLoadProgress] = useState<{ received: number; total: number }>({
    received: 0,
    total: 0,
  });

  // onOpenChange held in a ref so the load effect doesn't re-trigger
  // if a fresh function reference comes in from a parent re-render.
  // Empirically the parent passes a stable setState setter, but the
  // ref pattern makes the effect immune to upstream changes.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  // Reset transient state when the modal closes. Separated from the
  // load effect so a state change here can't accidentally cancel an
  // in-flight load. sourceRef is also cleared so the next open starts
  // from a known-empty state instead of holding the previous image's
  // bitmap.
  useEffect(() => {
    if (open) return;
    setT({ rotate: 0, flipH: false, flipV: false });
    setCrop(undefined);
    setCompletedCrop(null);
    setDisplayUrl(null);
    setLoaded(false);
    sourceRef.current = null;
  }, [open]);

  // Load the source image when the modal opens. Depends only on the
  // two values that actually require a re-fetch — anything else in
  // the parent's render cycle is irrelevant to whether we should
  // re-load. The previous combined effect listed onOpenChange as a
  // dep, which made the load fragile to upstream renders.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadProgress({ received: 0, total: 0 });
    // Loaded via fetch → blob → object URL so canvas operations
    // later don't taint on cross-origin (Supabase storage). The
    // sourceRef holds the bitmap; transforms drawImage from it.
    // Streamed so the modal can show "Loading 4.2 / 8.3 MB…"
    // instead of an unmoving spinner on a big file.
    void loadImageViaBlob(imageUrl, (received, total) => {
      if (!cancelled) setLoadProgress({ received, total });
    })
      .then((img) => {
        if (cancelled) return;
        sourceRef.current = img;
        setDisplayUrl(img.src);
        setLoaded(true);
        // Heads-up if saving will downgrade the format. Canvas can't
        // encode HEIC/AVIF/GIF back out, so any edit will land as JPEG
        // regardless of the original — set expectations upfront.
        if (!isCanvasNativeFormat(imageUrl)) {
          toast.info("Edits to this image will be saved as JPEG.");
        }
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Couldn't load image for editing.");
        onOpenChangeRef.current(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, imageUrl]);

  // Track the previous transformed objectURL so we can revoke it
  // when a new one replaces it (memory leak guard for large
  // multi-step edits).
  const prevTransformedUrlRef = useRef<string | null>(null);

  // Re-rasterize the source with the current transform whenever it
  // changes. Output goes through toBlob → createObjectURL instead of
  // toDataURL so big images (24 MP iPhone shots) don't generate
  // multi-MB base64 strings that some browsers silently truncate or
  // mishandle. Identity transform uses the original source blob URL
  // directly (no canvas pass needed).
  useEffect(() => {
    if (!open || !sourceRef.current) return;
    const src = sourceRef.current;
    // Guard: if the source decoded but reported zero dimensions
    // (broken HEIC/AVIF on a browser that pretends to support it),
    // canvas ops would silently produce a 0×0 output. Bail out
    // explicitly so the user sees a real error.
    if (!src.naturalWidth || !src.naturalHeight) {
      toast.error(
        "This image's format isn't supported by your browser's editor.",
      );
      setT({ rotate: 0, flipH: false, flipV: false });
      return;
    }
    if (t.rotate === 0 && !t.flipH && !t.flipV) {
      setDisplayUrl(src.src);
      setCrop(undefined);
      setCompletedCrop(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const baseCanvas = renderTransformed(src, t);
        const preview =
          baseCanvas.width > PREVIEW_MAX_WIDTH
            ? downscale(baseCanvas, PREVIEW_MAX_WIDTH)
            : baseCanvas;
        const blob: Blob | null = await new Promise((resolve) =>
          preview.toBlob((b) => resolve(b), "image/jpeg", 0.85),
        );
        if (!blob) {
          throw new Error("toBlob returned null (canvas may be tainted).");
        }
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setCrop(undefined);
        setCompletedCrop(null);
        setDisplayUrl(createdUrl);
        // Revoke the previous transformed URL after a tick so the
        // <img> has time to swap source without flicker.
        const prev = prevTransformedUrlRef.current;
        prevTransformedUrlRef.current = createdUrl;
        if (prev) {
          setTimeout(() => URL.revokeObjectURL(prev), 1_000);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Couldn't apply transform: ${msg}`);
        captureException(err, {
          where: "EditModal transform effect",
          rotate: t.rotate,
          flipH: t.flipH,
          flipV: t.flipV,
          naturalWidth: src.naturalWidth,
          naturalHeight: src.naturalHeight,
          imageUrl,
        });
        setT({ rotate: 0, flipH: false, flipV: false });
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl && createdUrl !== prevTransformedUrlRef.current) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [t, open, imageUrl]);

  // Final cleanup of any lingering objectURL when the modal closes.
  useEffect(() => {
    if (!open && prevTransformedUrlRef.current) {
      URL.revokeObjectURL(prevTransformedUrlRef.current);
      prevTransformedUrlRef.current = null;
    }
  }, [open]);

  function rotateBy(deg: number) {
    // flushSync forces React to commit this state update synchronously
    // before returning from the event handler. Without it, Sentry
    // traces showed the setT update getting deferred ~800ms (likely
    // React 18 concurrent-mode prioritization stalling on something),
    // by which time the user had already clicked away thinking the
    // button was broken. flushSync guarantees the rotation reaches
    // the screen on the same frame as the click.
    flushSync(() => {
      setT((p) => ({ ...p, rotate: ((p.rotate + deg) % 360 + 360) % 360 }));
    });
  }

  function resetCrop() {
    setCrop(undefined);
    setCompletedCrop(null);
  }

  // Save is disabled until the user actually changes something —
  // otherwise we'd re-upload the same content as a new file.
  const hasChanges =
    t.rotate !== 0 ||
    t.flipH ||
    t.flipV ||
    (completedCrop !== null &&
      completedCrop.width > 0 &&
      completedCrop.height > 0);

  const abortRef = useRef<AbortController | null>(null);

  async function save() {
    if (!user?.id || !sourceRef.current) return;
    // #3 from the audit — let Cancel / X stop an in-progress save.
    // Each save step checks the signal and bails before doing
    // anything destructive (upload, DB update, file remove).
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const checkAbort = () => {
      if (signal.aborted) throw new Error("aborted");
    };

    setSaving(true);
    let uploadedPath: string | null = null;
    try {
      const src = sourceRef.current;
      // First pass: render source through the current transform at
      // full natural resolution.
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

      checkAbort();

      // Match output format to the source when canvas can encode it
      // (jpeg/png/webp); HEIC/AVIF/GIF fall back to JPEG. PNG ignores
      // the quality arg.
      const fmt = pickOutputFormat(imageUrl);
      const blob: Blob | null = await new Promise((resolve) =>
        outCanvas.toBlob((b) => resolve(b), fmt.mime, fmt.quality),
      );
      if (!blob) throw new Error("Couldn't encode the edited image.");
      checkAbort();

      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fmt.ext}`;
      const path = `${user.id}/${filename}`;
      const upload = await supabase.storage
        .from("vendor-gallery")
        .upload(path, blob, { contentType: fmt.mime, upsert: false });
      if (upload.error) throw upload.error;
      uploadedPath = path;
      checkAbort();

      const { data: pub } = supabase.storage
        .from("vendor-gallery")
        .getPublicUrl(path);

      const blurInfo = await computeBlurhash(
        new File([blob], filename, { type: fmt.mime }),
      );
      checkAbort();

      // Preserve EXIF on transform-only edits — the camera / lens /
      // capture date are still accurate. Drop EXIF on crop. Re-fetch
      // the row's current exif so a backfill that ran during the
      // user's edit session doesn't get overwritten by a stale
      // snapshot.
      const cropped =
        completedCrop && completedCrop.width > 0 && completedCrop.height > 0;
      let nextExif: unknown = null;
      if (!cropped) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: fresh } = await (supabase as any)
          .from("vendor_gallery_images")
          .select("exif")
          .eq("id", imageId)
          .maybeSingle();
        nextExif = fresh?.exif ?? null;
      }
      checkAbort();

      // #1 from the audit — chain .select().maybeSingle() so we can
      // tell when the row was deleted in another session between
      // load and save. Without this, the UPDATE matches 0 rows
      // silently and the user sees "Saved" while the freshly-
      // uploaded file becomes an orphan.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: updated, error: updErr } = await (supabase as any)
        .from("vendor_gallery_images")
        .update({
          image_url: pub.publicUrl,
          width: blurInfo?.width ?? outCanvas.width,
          height: blurInfo?.height ?? outCanvas.height,
          blurhash: blurInfo?.blurhash ?? null,
          file_size_bytes: blob.size,
          exif: nextExif,
        })
        .eq("id", imageId)
        .select()
        .maybeSingle();
      if (updErr) throw updErr;
      if (!updated) {
        // Row vanished between open and save. Clean up the orphan
        // file we just uploaded and surface a clean error.
        await removeGalleryFileWithRetry(path);
        throw new Error(
          "This image was removed in another session. Your edit wasn't saved.",
        );
      }

      // Old-file removal with retry — #5 from the audit. Fire-and-
      // forget would leave the previous version stranded on a
      // transient network blip; retry with exponential backoff.
      const oldPath = extractStoragePath(imageUrl);
      if (oldPath) {
        void removeGalleryFileWithRetry(oldPath);
      }

      toast.success("Saved.");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      // Aborted saves get a quiet toast — no error sound — and we
      // clean up the orphan file we may have already uploaded.
      const isAbort = err instanceof Error && err.message === "aborted";
      if (isAbort && uploadedPath) {
        await removeGalleryFileWithRetry(uploadedPath);
      }
      const msg = isAbort
        ? "Save cancelled."
        : err instanceof Error
          ? err.message
          : "Couldn't save edit.";
      toast[isAbort ? "info" : "error"](msg);
    } finally {
      setSaving(false);
      abortRef.current = null;
    }
  }

  // When the modal closes (Cancel / X / Esc), kill any in-flight
  // save so the user isn't waiting on a request they don't want.
  function handleClose(next: boolean) {
    if (!next && saving) {
      abortRef.current?.abort();
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="rounded-2xl sm:max-w-2xl"
        onClick={(e) => {
          // React events bubble through the COMPONENT tree, not the DOM
          // tree. Even though DialogContent is portaled outside the
          // Lightbox's DOM tree, every click inside this modal still
          // bubbles up to Lightbox's outer `onClick={onClose}`. Without
          // stopPropagation, clicking Rotate/Flip closes the Lightbox
          // mid-canvas-op and the in-flight transform IIFE gets
          // cancelled by the cleanup that runs on unmount.
          e.stopPropagation();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-editorial text-2xl">Edit image</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-secondary/40 rounded-lg p-3 flex items-center justify-center min-h-[300px]">
            {!loaded || !displayUrl ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-xs">
                  {loadProgress.total > 0
                    ? `Loading ${formatBytes(loadProgress.received)} / ${formatBytes(loadProgress.total)}`
                    : loadProgress.received > 0
                      ? `Loading ${formatBytes(loadProgress.received)}`
                      : "Loading image…"}
                </p>
              </div>
            ) : (
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                keepSelection
              >
                <img
                  ref={cropImgRef}
                  key={displayUrl}
                  src={displayUrl}
                  alt="Edit"
                  className="max-h-[60vh] max-w-full rounded-md"
                  onError={() => {
                    toast.error("Preview failed to load. Try Cancel + Edit again.");
                    captureException(
                      new Error("EditModal preview img onError"),
                      { displayUrl: displayUrl.slice(0, 80), imageUrl },
                    );
                  }}
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
              onClick={() => {
                flushSync(() => {
                  setT((p) => ({ ...p, flipH: !p.flipH }));
                });
              }}
              className="rounded-full"
            >
              <FlipHorizontal className="w-3.5 h-3.5 mr-1.5" />
              Flip H
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                flushSync(() => {
                  setT((p) => ({ ...p, flipV: !p.flipV }));
                });
              }}
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
            onClick={() => handleClose(false)}
            className="rounded-full"
          >
            {saving ? "Stop" : "Cancel"}
          </Button>
          <Button
            onClick={save}
            disabled={saving || !loaded || !hasChanges}
            className="rounded-full"
          >
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

function downscale(source: HTMLCanvasElement, maxWidth: number): HTMLCanvasElement {
  const ratio = maxWidth / source.width;
  const W = maxWidth;
  const H = Math.round(source.height * ratio);
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, W, H);
  return out;
}

function extractStoragePath(publicUrl: string): string | null {
  const m = publicUrl.match(/vendor-gallery\/([^?]+)/);
  return m ? m[1] : null;
}
