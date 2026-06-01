import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { VendoraMark } from "@/components/shared/VendoraLogo";

// Heavy chat — only load its bundle once the user opens the panel.
const MySpaceChat = lazy(() =>
  import("@/components/super-agents/MySpaceChat").then((m) => ({
    default: m.MySpaceChat,
  }))
);

// Floating My Space launcher. A small AI button (bottom-right); tapping it
// opens the assistant in an almost-full-screen overlay with a blurred
// backdrop — a preview-style modal, not a route change.
export function MySpaceLauncher() {
  const [open, setOpen] = useState(false);

  // Draggable position. null → default bottom-right (via CSS). Once the
  // user drags it, we pin left/top in px and remember it.
  const BTN = 56; // w-14 / h-14
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const s = localStorage.getItem("myspace-fab-pos");
      return s ? (JSON.parse(s) as { x: number; y: number }) : null;
    } catch {
      return null;
    }
  });
  const drag = useRef<
    { sx: number; sy: number; ox: number; oy: number; moved: boolean } | null
  >(null);

  // Keep it on-screen if the window shrinks.
  useEffect(() => {
    const clamp = () =>
      setPos((p) =>
        p
          ? {
            x: Math.min(Math.max(8, p.x), window.innerWidth - BTN - 8),
            y: Math.min(Math.max(8, p.y), window.innerHeight - BTN - 8),
          }
          : p
      );
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return; // ignore tiny jitters
    d.moved = true;
    setPos({
      x: Math.min(Math.max(8, d.ox + dx), window.innerWidth - BTN - 8),
      y: Math.min(Math.max(8, d.oy + dy), window.innerHeight - BTN - 8),
    });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
    if (d?.moved) {
      // Persist the dropped position.
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem("myspace-fab-pos", JSON.stringify(p));
          } catch { /* ignore */ }
        }
        return p;
      });
    } else {
      setOpen(true); // a tap (no real drag) → open
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Lock background scroll while the overlay is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {!open && (
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-label="Open My Space assistant (drag to move)"
          className={`fixed z-50 w-14 h-14 rounded-full shadow-xl inline-flex items-center justify-center text-white touch-none select-none cursor-grab active:cursor-grabbing transition-transform hover:scale-105 ${
            pos ? "" : "bottom-6 right-6"
          }`}
          style={{
            background: "linear-gradient(135deg, #ff8a4c, #d97757)",
            ...(pos ? { left: pos.x, top: pos.y } : {}),
          }}
        >
          <VendoraMark size={26} color="#fff" className="pointer-events-none" />
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="My Space assistant"
        >
          {/* Blurred backdrop — click to dismiss. */}
          <div
            className="absolute inset-0 bg-background/50 backdrop-blur-md"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Almost-full-screen panel. */}
          <div className="relative w-full max-w-6xl h-[92vh] rounded-2xl overflow-hidden shadow-2xl border border-foreground/10 bg-card animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full inline-flex items-center justify-center bg-foreground/5 hover:bg-foreground/10 text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <Suspense fallback={null}>
              <MySpaceChat docked />
            </Suspense>
          </div>
        </div>
      )}
    </>
  );
}
