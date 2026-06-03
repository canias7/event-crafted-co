// Draw-to-sign canvas. Reports a PNG data URL (or null when cleared) via
// onChange. Sizes its backing buffer to its rendered size on mount so the
// pointer coordinates line up 1:1 (no scaling offset).
import { useEffect, useRef, useState } from "react";

export function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const inked = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // Match the backing buffer to the displayed size for crisp 1:1 strokes.
    c.width = c.clientWidth || 440;
    c.height = c.clientHeight || 140;
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return;
    drawing.current = true;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    try {
      c.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "#18181b";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    if (!inked.current) {
      inked.current = true;
      setHasInk(true);
    }
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    const c = canvasRef.current;
    if (c && inked.current) onChange(c.toDataURL("image/png"));
  }

  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    inked.current = false;
    setHasInk(false);
    onChange(null);
  }

  return (
    <div>
      <div className="relative rounded-lg border border-foreground/15 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="w-full h-[140px] touch-none cursor-crosshair block"
        />
        {!hasInk ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Draw your signature here
          </span>
        ) : null}
      </div>
      {hasInk ? (
        <button
          type="button"
          onClick={clear}
          className="mt-1.5 text-xs text-muted-foreground hover:text-foreground underline"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
