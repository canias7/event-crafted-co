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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center hover:bg-white/25"
      >
        <X className="h-5 w-5" />
      </button>
      <div
        className="relative max-w-3xl w-full max-h-[90vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {item.kind === "post" ? (
          <img
            src={item.image_url}
            alt={item.caption ?? "Post"}
            className="max-h-[80vh] w-auto object-contain rounded-2xl"
          />
        ) : (
          <video
            src={item.video_url}
            controls
            autoPlay
            className="max-h-[80vh] w-auto object-contain rounded-2xl"
          />
        )}
        {item.caption ? (
          <p className="mt-3 text-sm text-white/90 max-w-xl text-center px-4 whitespace-pre-wrap">
            {item.caption}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-white/60">
          {new Date(item.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
