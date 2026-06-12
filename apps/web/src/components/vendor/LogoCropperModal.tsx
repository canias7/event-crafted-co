import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Lightweight in-page logo cropper. The user picks an image, we show
// it inside a square viewport with a circular preview cutout, and the
// user drags to position + slides to zoom. Apply renders the selected
// crop into a square JPEG via an offscreen <canvas> and hands that
// File back to the parent for upload.
//
// Fit model: the slider lets the user zoom OUT until their whole logo
// fits inside the frame (with padding), not just COVER it. Wide
// wordmarks and tall logos used to be un-fittable — the old minimum
// zoom forced the image to fill the circle, so anything non-square got
// cropped and there was no way to see the whole mark. We open at
// "contain" (entire logo visible) and let zoom range from well below
// that (room to sit inside the circular crop) up to a tight crop.

const OUTPUT = 512; // px — the final cropped JPEG dimension
const BG = "#ffffff"; // padding behind a logo that doesn't fill the frame

interface Props {
  file: File;
  onCancel: () => void;
  onApply: (cropped: File) => void;
}

export function LogoCropperModal({ file, onCancel, onApply }: Props) {
  // On-screen square size. Fixed 320 on desktop, but clamp to the
  // viewport width so the crop square doesn't overflow narrow phones
  // (mobile view). Computed once — the modal is transient.
  const viewport = useMemo(() => {
    if (typeof window === "undefined") return 320;
    return Math.min(320, Math.max(220, window.innerWidth - 72));
  }, []);

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(4);
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
    const w = i.naturalWidth;
    const h = i.naturalHeight;
    setImgSize({ w, h });
    // cover  → smaller side fills the viewport (image fully covers the
    //          crop circle; this was the old hard minimum).
    // contain → larger side fits the viewport (whole image visible).
    const cover = viewport / Math.min(w, h);
    const contain = viewport / Math.max(w, h);
    // Let the user shrink below "contain" so a wide/tall logo can sit
    // comfortably INSIDE the circular crop with margin — that's the
    // whole point of this change.
    setMinZoom(contain * 0.55);
    setMaxZoom(cover * 4);
    // Open showing the entire logo, not a forced-cover crop.
    setZoom(contain);
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
    // When the image is smaller than the viewport (zoomed past
    // contain), max becomes 0 and the image stays centered.
    const maxX = Math.max(0, (w - viewport) / 2);
    const maxY = Math.max(0, (h - viewport) / 2);
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
    // Fill the frame first so any padding around a contained logo
    // renders as a clean background instead of JPEG's transparent→black
    // default.
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    // The on-screen viewport shows a viewport×viewport square whose
    // center is at the image's center + offset, scaled by zoom. We
    // need the source rectangle in image-space. When zoomed past
    // contain, this rect extends beyond the image bounds — drawImage
    // simply leaves those pixels untouched, so the BG fill shows.
    const srcW = viewport / zoom;
    const srcH = viewport / zoom;
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

  const radius = viewport / 2 - 8;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(28px) saturate(140%)",
        WebkitBackdropFilter: "blur(28px) saturate(140%)",
      }}
    >
      <div
        className="relative rounded-2xl p-6 w-full max-w-md"
        style={{
          background: "rgba(255,255,255,0.97)",
          border: "0.5px solid rgba(0,0,0,0.08)",
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
          Drag to position. Slide to zoom — zoom all the way out to fit your
          whole logo.
        </p>

        <div
          className="relative mx-auto select-none overflow-hidden rounded-2xl"
          style={{
            width: viewport,
            height: viewport,
            background: BG,
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
            width={viewport}
            height={viewport}
            viewBox={`0 0 ${viewport} ${viewport}`}
          >
            <defs>
              <mask id="logo-crop-hole">
                <rect width={viewport} height={viewport} fill="white" />
                <circle cx={viewport / 2} cy={viewport / 2} r={radius} fill="black" />
              </mask>
            </defs>
            <rect
              width={viewport}
              height={viewport}
              fill="rgba(0,0,0,0.45)"
              mask="url(#logo-crop-hole)"
            />
            <circle
              cx={viewport / 2}
              cy={viewport / 2}
              r={radius}
              fill="none"
              stroke="rgba(0,0,0,0.25)"
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
            max={maxZoom}
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
