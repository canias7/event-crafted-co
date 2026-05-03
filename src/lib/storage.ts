import { supabase } from "@/integrations/supabase/client";

const BUCKET = "vendor-portfolios";

interface ImageOpts {
  width?: number;
  height?: number;
  quality?: number;
  resize?: "cover" | "contain" | "fill";
}

/**
 * Resolve a vendor portfolio storage path to a public URL, optionally with
 * Supabase image transformations (width/height/quality/resize).
 *
 * Image transformations require a Pro Supabase plan; on free tier the params
 * are silently ignored and the original is returned. This helper is therefore
 * forward-compatible — turning it on later is a project-settings flip, no
 * code change.
 */
export function vendorImageUrl(path: string, opts?: ImageOpts): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path, {
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

/** Build a srcset string for a vendor portfolio image at multiple widths. */
export function vendorImageSrcset(path: string, widths: number[]): string {
  return widths
    .map((w) => `${vendorImageUrl(path, { width: w })} ${w}w`)
    .join(", ");
}
