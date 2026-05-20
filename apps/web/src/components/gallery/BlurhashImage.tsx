// Wraps an <img> with a blurhash data-URL placeholder. The decoded
// hash renders behind the real image; the real image fades in on
// load. If no hash is provided, the placeholder falls back to a
// neutral secondary background — same shape as the v1 tiles.

import { useEffect, useMemo, useState } from "react";
import { blurhashToDataUrl } from "@/lib/galleryImage";

interface Props {
  src: string;
  blurhash: string | null;
  alt: string;
  className?: string;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  draggable?: boolean;
}

export function BlurhashImage({
  src,
  blurhash,
  alt,
  className,
  onLoad,
  draggable,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  // Reset loaded state when the src changes (e.g. after editing the
  // underlying image) so the placeholder shows again instead of an
  // empty frame.
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  const placeholderUrl = useMemo(
    () => (blurhash ? blurhashToDataUrl(blurhash, 32, 32) : null),
    [blurhash],
  );

  return (
    <div
      className={`relative overflow-hidden ${className ?? ""}`}
      style={
        placeholderUrl
          ? {
              backgroundImage: `url(${placeholderUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        draggable={draggable}
        onLoad={(e) => {
          setLoaded(true);
          onLoad?.(e);
        }}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
