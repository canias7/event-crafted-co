// <Picture> — renders the output of `vite-imagetools` `?as=picture` imports
// as a real <picture> with AVIF + WebP sources and a JPG fallback. The
// browser picks the best format it supports; non-modern browsers fall
// through to the <img> tag's regular src.
import { forwardRef } from "react";

interface PictureSource {
  sources: Record<string, string>;
  img: { src: string; w: number; h: number };
}

interface Props {
  /** vite-imagetools picture object */
  source: PictureSource;
  alt: string;
  className?: string;
  /** "eager" for above-the-fold hero, "lazy" for everything else */
  loading?: "eager" | "lazy";
  /** Hint for the browser's preloader on which size we'll actually render */
  sizes?: string;
  /** Tells the browser this is the LCP candidate */
  fetchPriority?: "high" | "low" | "auto";
}

export const Picture = forwardRef<HTMLImageElement, Props>(function Picture(
  { source, alt, className, loading = "lazy", sizes, fetchPriority },
  ref,
) {
  const { sources, img } = source;
  return (
    <picture>
      {sources.avif && (
        <source srcSet={sources.avif} type="image/avif" sizes={sizes} />
      )}
      {sources.webp && (
        <source srcSet={sources.webp} type="image/webp" sizes={sizes} />
      )}
      <img
        ref={ref}
        src={img.src}
        srcSet={sources.jpg}
        sizes={sizes}
        width={img.w}
        height={img.h}
        alt={alt}
        loading={loading}
        decoding="async"
        // @ts-expect-error fetchPriority is valid HTML but TS hasn't caught up
        fetchpriority={fetchPriority}
        className={className}
      />
    </picture>
  );
});

export type { PictureSource };
