import { supabase } from "@/integrations/supabase/client";

const VENDOR_BUCKET = "vendor-portfolios";

interface ImageOpts {
  width?: number;
  height?: number;
  quality?: number;
  resize?: "cover" | "contain" | "fill";
}

/**
 * Generic Supabase image URL builder. Use this for any bucket where you'd
 * like the storage layer to resize/recompress on read instead of serving
 * the full-res original.
 *
 * Image transformations require a Pro Supabase plan; on free tier the params
 * are silently ignored and the original is returned. Adopting the helper
 * everywhere is forward-compatible — turning it on later is a project-
 * settings flip, no code change.
 */
export function transformedImageUrl(
  bucket: string,
  path: string,
  opts?: ImageOpts,
): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path, {
    transform: opts
      ? {
          width: opts.width,
          height: opts.height,
          quality: opts.quality ?? 75,
          resize: opts.resize ?? "cover",
        }
      : undefined,
  });
  return data.publicUrl;
}

/** Vendor-portfolio bucket convenience wrapper. */
export function vendorImageUrl(path: string, opts?: ImageOpts): string {
  return transformedImageUrl(VENDOR_BUCKET, path, opts);
}

/** Build a srcset string for a vendor portfolio image at multiple widths. */
export function vendorImageSrcset(path: string, widths: number[]): string {
  return widths
    .map((w) => `${vendorImageUrl(path, { width: w })} ${w}w`)
    .join(", ");
}
