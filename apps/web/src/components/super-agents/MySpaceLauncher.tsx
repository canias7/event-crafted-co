import { lazy, Suspense, useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

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
          onClick={() => setOpen(true)}
          aria-label="Open My Space assistant"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl inline-flex items-center justify-center text-white transition-transform hover:scale-105 active:scale-95"
          style={{ background: "linear-gradient(135deg, #ff8a4c, #d97757)" }}
        >
          <Sparkles className="w-6 h-6" />
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
