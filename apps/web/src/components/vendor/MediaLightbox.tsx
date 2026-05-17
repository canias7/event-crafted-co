// Fullscreen media lightbox for posts + reels. Tap a grid tile to
// open; tap the backdrop or the close button to dismiss. Mirrors the
// lightbox in apps/vendor-mobile/app/(vendor)/profile.tsx.

import { useEffect } from "react";
import { X } from "lucide-react";

type LightboxItem =
  | {
      kind: "post";
      image_url: string;
      caption: string | null;
      created_at: string;
    }
  | {
      kind: "reel";
      video_url: string;
      caption: string | null;
      created_at: string;
    };

export function MediaLightbox({
  item,
  onClose,
}: {
  item: LightboxItem | null;
  onClose: () => void;
}) {
  // Escape key closes the lightbox.
  useEffect(() => {
    if (!item) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      style={{
        background: "rgba(20,16,12,0.55)",
        backdropFilter: "blur(28px) saturate(140%)",
        WebkitBackdropFilter: "blur(28px) saturate(140%)",
      }}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 backdrop-blur text-foreground flex items-center justify-center hover:bg-white/25"
      >
        <X className="h-5 w-5" />
      </button>
      <div
        className="relative w-full max-w-6xl max-h-[92vh] flex flex-col md:flex-row md:items-center md:justify-center gap-6 md:gap-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Caption rail — left side on md+, stacks above the media on
            small screens. Empty when there's no caption (timestamp
            still rides along underneath). */}
        <aside className="order-2 md:order-1 md:w-80 md:max-w-sm md:shrink-0">
          {item.caption ? (
            <p
              className="text-[16px] md:text-[17px] leading-relaxed whitespace-pre-wrap font-medium"
              style={{
                color: "#fff",
                textShadow: "0 1px 10px rgba(0,0,0,0.6)",
              }}
            >
              {item.caption}
            </p>
          ) : null}
          <p
            className="mt-3 text-[11px] uppercase tracking-[0.18em] font-medium"
            style={{
              color: "rgba(255,255,255,0.78)",
              textShadow: "0 1px 6px rgba(0,0,0,0.5)",
            }}
          >
            {new Date(item.created_at).toLocaleString()}
          </p>
        </aside>

        {/* Media — fills remaining space, capped at 80vh tall. */}
        <div className="order-1 md:order-2 flex-1 flex justify-center items-center min-w-0">
          {item.kind === "post" ? (
            <img
              src={item.image_url}
              alt={item.caption ?? "Post"}
              className="max-h-[80vh] max-w-full w-auto object-contain rounded-2xl shadow-2xl"
            />
          ) : (
            <video
              src={item.video_url}
              controls
              autoPlay
              className="max-h-[80vh] max-w-full w-auto object-contain rounded-2xl shadow-2xl"
            />
          )}
        </div>
      </div>
    </div>
  );
}
