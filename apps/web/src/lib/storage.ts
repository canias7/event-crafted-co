import { supabase } from "@/integrations/supabase/client";

const VENDOR_BUCKET = "vendor-portfolios";

interface ImageOpts {
  width?: number;
  height?: number;
  quality?: number;
  resize?: "cover" | "contain" | "fill";
}

/**
 * Generic Supabase image URL builder.
 *
 * Image transformations require a paid Supabase plan — passing
 * `transform` to `getPublicUrl` generates a `/storage/v1/render/image/`
 * URL that returns HTTP 403 on this project's tier. So `opts` is
 * accepted (callers stay compatible / forward-compat) but ignored —
 * we always return the plain `/storage/v1/object/public/` URL and
 * let the browser scale via CSS. Flip the implementation back to
 * transform-on-read once we're on a Pro plan.
 */
export function transformedImageUrl(
  bucket: string,
  path: string,
  _opts?: ImageOpts,
): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Vendor-portfolio bucket convenience wrapper. */
export function vendorImageUrl(path: string, opts?: ImageOpts): string {
  return transformedImageUrl(VENDOR_BUCKET, path, opts);
}

/**
 * Build a srcset string for a vendor portfolio image at multiple widths.
 * No-op while transforms are off (every entry resolves to the same URL),
 * but kept so the call sites' `srcSet={vendorImageSrcset(...)}` markup
 * still works and starts paying off once the Pro plan is on.
 */
export function vendorImageSrcset(path: string, widths: number[]): string {
  return widths
    .map((w) => `${vendorImageUrl(path, { width: w })} ${w}w`)
    .join(", ");
}
