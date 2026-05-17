import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Lightweight in-page logo cropper. The user picks an image, we show
// it inside a square viewport with a circular preview cutout, and the
// user drags to position + slides to zoom. Apply renders the selected
// crop into a 512×512 JPEG via an offscreen <canvas> and hands that
// File back to the parent for upload.

const VIEWPORT = 320; // px — the on-screen square
const OUTPUT = 512; // px — the final cropped JPEG dimension

interface Props {
  file: File;
  onCancel: () => void;
  onApply: (cropped: File) => void;
}

export function LogoCropperModal({ file, onCancel, onApply }: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const i = e.currentTarget;
    setImgSize({ w: i.naturalWidth, h: i.naturalHeight });
    // Minimum zoom: smaller side fills the viewport (image must
    // always cover the crop circle).
    const base = VIEWPORT / Math.min(i.naturalWidth, i.naturalHeight);
    setMinZoom(base);
    setZoom(base);
    setOffset({ x: 0, y: 0 });
  }

  function clampOffset(
    x: number,
    y: number,
    z: number,
    size: { w: number; h: number },
  ) {
    const w = size.w * z;
    const h = size.h * z;
    const maxX = Math.max(0, (w - VIEWPORT) / 2);
    const maxY = Math.max(0, (h - VIEWPORT) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }

  function startDrag(cx: number, cy: number) {
    dragStart.current = { x: cx - offset.x, y: cy - offset.y };
    setDragging(true);
  }
  function moveDrag(cx: number, cy: number) {
    if (!dragging || !imgSize) return;
    setOffset(
      clampOffset(cx - dragStart.current.x, cy - dragStart.current.y, zoom, imgSize),
    );
  }
  function endDrag() {
    setDragging(false);
  }

  function onZoomChange(next: number) {
    if (imgSize) setOffset((o) => clampOffset(o.x, o.y, next, imgSize));
    setZoom(next);
  }

  function apply() {
    const img = imgRef.current;
    if (!img || !imgSize) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // The on-screen viewport shows a VIEWPORT×VIEWPORT square whose
    // center is at the image's center + offset, scaled by zoom. We
    // need the source rectangle in image-space.
    const srcW = VIEWPORT / zoom;
    const srcH = VIEWPORT / zoom;
    const srcX = imgSize.w / 2 - srcW / 2 - offset.x / zoom;
    const srcY = imgSize.h / 2 - srcH / 2 - offset.y / zoom;
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const base = file.name.replace(/\.[^.]+$/, "");
        const cropped = new File([blob], `${base}.jpg`, { type: "image/jpeg" });
        onApply(cropped);
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{
        background: "rgba(20,16,12,0.55)",
        backdropFilter: "blur(28px) saturate(140%)",
        WebkitBackdropFilter: "blur(28px) saturate(140%)",
      }}
    >
      <div
        className="relative rounded-2xl p-6 w-full max-w-md"
        style={{
          background: "rgba(255,253,250,0.97)",
          border: "0.5px solid rgba(255,138,76,0.22)",
        }}
      >
        <button
          onClick={onCancel}
          aria-label="Close"
          className="absolute top-3 right-3 w-9 h-9 rounded-full hover:bg-black/5 flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="font-editorial italic text-2xl mb-1">Adjust your logo</h2>
        <p className="text-xs text-muted-foreground mb-5">
          Drag to position. Slide to zoom.
        </p>

        <div
          className="relative mx-auto select-none overflow-hidden rounded-2xl"
          style={{
            width: VIEWPORT,
            height: VIEWPORT,
            background: "#0a0a0a",
            touchAction: "none",
            cursor: dragging ? "grabbing" : "grab",
          }}
          onPointerDown={(e) => {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            startDrag(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => moveDrag(e.clientX, e.clientY)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {imgUrl ? (
            <img
              ref={imgRef}
              src={imgUrl}
              onLoad={handleImgLoad}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: imgSize ? imgSize.w * zoom : "auto",
                height: imgSize ? imgSize.h * zoom : "auto",
                transform: `translate(${
                  imgSize ? -(imgSize.w * zoom) / 2 + offset.x : 0
                }px, ${imgSize ? -(imgSize.h * zoom) / 2 + offset.y : 0}px)`,
                maxWidth: "none",
                pointerEvents: "none",
              }}
            />
          ) : null}
          {/* Circular cutout overlay — everything outside the circle
              dims; the circle keeps the underlying image fully visible. */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={VIEWPORT}
            height={VIEWPORT}
            viewBox={`0 0 ${VIEWPORT} ${VIEWPORT}`}
          >
            <defs>
              <mask id="logo-crop-hole">
                <rect width={VIEWPORT} height={VIEWPORT} fill="white" />
                <circle
                  cx={VIEWPORT / 2}
                  cy={VIEWPORT / 2}
                  r={VIEWPORT / 2 - 8}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width={VIEWPORT}
              height={VIEWPORT}
              fill="rgba(0,0,0,0.55)"
              mask="url(#logo-crop-hole)"
            />
            <circle
              cx={VIEWPORT / 2}
              cy={VIEWPORT / 2}
              r={VIEWPORT / 2 - 8}
              fill="none"
              stroke="rgba(255,255,255,0.9)"
              strokeWidth="1.5"
            />
          </svg>
        </div>

        <div className="mt-5">
          <label
            htmlFor="logo-zoom"
            className="text-[11px] uppercase tracking-[0.18em] font-medium text-muted-foreground"
          >
            Zoom
          </label>
          <input
            id="logo-zoom"
            type="range"
            min={minZoom}
            max={minZoom * 4}
            step={0.01}
            value={zoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            className="w-full mt-1 accent-foreground"
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" className="rounded-full" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={apply} disabled={!imgSize}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
