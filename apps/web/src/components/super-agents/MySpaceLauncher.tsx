import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

// Heavy chat — only load its bundle once the user opens the panel.
const MySpaceChat = lazy(() =>
  import("@/components/super-agents/MySpaceChat").then((m) => ({
    default: m.MySpaceChat,
  }))
);

// Floating My Space launcher. A small draggable AI button; tapping it opens
// the assistant in an almost-full-screen overlay with a blurred backdrop.
export function MySpaceLauncher() {
  const [open, setOpen] = useState(false);
  const BTN = 56; // w-14 / h-14
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // After a real drag, the browser still fires a click — suppress it so the
  // overlay doesn't open when the user was only repositioning the button.
  const suppressClick = useRef(false);

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

  // Keep clear of the mobile bottom nav (shown below the lg breakpoint).
  const bottomGap = () =>
    typeof window !== "undefined" && window.innerWidth < 1024 ? 88 : 8;

  // Re-clamp on resize so it never ends up off-screen / under the nav.
  useEffect(() => {
    const clamp = () =>
      setPos((p) =>
        p
          ? {
            x: Math.min(Math.max(8, p.x), window.innerWidth - BTN - 8),
            y: Math.min(Math.max(8, p.y), window.innerHeight - BTN - bottomGap()),
          }
          : p
      );
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    suppressClick.current = false;
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
      y: Math.min(Math.max(8, d.oy + dy), window.innerHeight - BTN - bottomGap()),
    });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
    if (d?.moved) {
      suppressClick.current = true; // the trailing click shouldn't open it
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem("myspace-fab-pos", JSON.stringify(p));
          } catch { /* ignore */ }
        }
        return p;
      });
    }
  };
  const onPointerCancel = () => {
    drag.current = null;
  };
  // Opening lives on click so keyboard (Enter/Space) works too — a drag
  // sets suppressClick to swallow the synthetic click that follows it.
  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setOpen(true);
  };

  // Overlay behavior: Escape to close, scroll lock, a basic focus trap, and
  // focus restoration back to the launcher on close.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusables = () =>
      panel
        ? Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute("disabled"))
        : [];
    const t = setTimeout(() => {
      const f = focusables();
      (f[0] ?? panel)?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "Tab" && panel) {
        const f = focusables();
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      fabRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      {!open && (
        <button
          ref={fabRef}
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={onClick}
          aria-label="Open My Space assistant (drag to move)"
          className={`myspace-fab fixed z-50 w-14 h-14 rounded-2xl bg-cover bg-center touch-none select-none cursor-grab active:cursor-grabbing transition-transform hover:scale-105 ${
            pos ? "" : "bottom-24 right-6 lg:bottom-6"
          }`}
          style={{
            backgroundImage: "url(/pwa-512.png)",
            ...(pos ? { left: pos.x, top: pos.y } : {}),
          }}
        />
      )}

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="My Space assistant"
        >
          <div
            className="absolute inset-0 bg-background/50 backdrop-blur-md"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            ref={panelRef}
            className="relative w-full max-w-6xl h-[92vh] rounded-2xl overflow-hidden shadow-2xl border border-foreground/10 bg-card animate-in fade-in zoom-in-95 duration-150"
          >
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
