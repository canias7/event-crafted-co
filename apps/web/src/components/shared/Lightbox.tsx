import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface LightboxImage {
  src: string;
  alt?: string;
  caption?: string | null;
  href?: string | null;
}

interface Props {
  images: LightboxImage[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}

export function Lightbox({ images, index, onClose, onIndexChange }: Props) {
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (index === null) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && index < images.length - 1)
        onIndexChange(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    },
    [index, images.length, onClose, onIndexChange],
  );

  useEffect(() => {
    if (index === null) return;
    document.addEventListener("keydown", onKey);
    // Prevent background scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, onKey]);

  if (index === null || images.length === 0) return null;
  const current = images[index];
  if (!current) return null;

  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      className="fixed inset-0 z-[100] bg-foreground/95 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-background/10 hover:bg-background/20 text-background flex items-center justify-center transition-colors"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="absolute top-4 left-4 text-background/70 text-xs tnum">
        {index + 1} / {images.length}
      </div>

      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index - 1);
          }}
          className="absolute left-4 md:left-8 w-12 h-12 rounded-full bg-background/10 hover:bg-background/20 text-background flex items-center justify-center transition-colors"
          aria-label="Previous"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index + 1);
          }}
          className="absolute right-4 md:right-8 w-12 h-12 rounded-full bg-background/10 hover:bg-background/20 text-background flex items-center justify-center transition-colors"
          aria-label="Next"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      <div
        className="max-w-[90vw] max-h-[88vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={current.src}
          alt={current.alt ?? current.caption ?? "Image"}
          className="max-w-full max-h-[80vh] object-contain rounded-2xl"
        />
        {(current.caption || current.href) && (
          <div className="mt-4 text-center max-w-xl">
            {current.caption && (
              <p className="text-background text-sm leading-relaxed">
                {current.caption}
              </p>
            )}
            {current.href && (
              <a
                href={current.href}
                target="_blank"
                rel="noreferrer"
                className="inline-block mt-2 text-xs text-background/70 hover:text-background underline"
              >
                Open source
              </a>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
