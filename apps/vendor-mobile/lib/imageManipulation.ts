// Client-side image downscale + re-encode for listing photo uploads.
// Mirrors apps/web/src/lib/imageCompress.ts (2400px longest edge, JPEG
// at 0.85) so a photo uploaded from the app lands in storage at the
// same resolution/quality as one uploaded from the web.
//
// Why: the image picker hands back full-resolution camera-roll photos
// (often 4032×3024, multiple MB). Listing thumbnails/lightbox never
// need more than ~1600px, so the original is wasted storage +
// bandwidth on every host who views the listing. Downscaling here
// matches web's footprint.
//
// Best-effort: any manipulation failure falls back to the original
// asset so the upload still happens — we never block an upload on
// compression.

import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 0.85;

export type PickedAsset = {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string;
};

/**
 * Resize so the longest edge is ≤ MAX_DIMENSION and re-encode as JPEG.
 * Always re-encodes (even when no resize is needed) so the picker's
 * 0.9-quality output is brought down to the same 0.85 as web. Returns
 * the manipulated file uri + its mime; on any failure returns the
 * original asset untouched.
 */
export async function compressForUpload(
  asset: PickedAsset,
): Promise<{ uri: string; mime: string }> {
  try {
    const w = asset.width ?? 0;
    const h = asset.height ?? 0;
    const ctx = ImageManipulator.manipulate(asset.uri);
    const longest = Math.max(w, h);
    if (w > 0 && h > 0 && longest > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / longest;
      ctx.resize({
        width: Math.round(w * scale),
        height: Math.round(h * scale),
      });
    }
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    return { uri: out.uri, mime: "image/jpeg" };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[imageManipulation] compress failed, using original", err);
    return { uri: asset.uri, mime: asset.mimeType ?? "image/jpeg" };
  }
}

const LOGO_MAX_DIMENSION = 1024;

/**
 * Prepare a picked logo for upload: downscale so the longest edge is
 * ≤ LOGO_MAX_DIMENSION and export as PNG **base64** — PNG so a logo
 * with a transparent background keeps its transparency (JPEG would
 * flatten it onto black), base64 so the bytes stay in JS all the way
 * to the storage upload (no tmpfile, no fetch(file://), both of which
 * proved unreliable on device).
 *
 * Unlike compressForUpload this THROWS on failure — the logo flow must
 * surface errors, not quietly upload something else.
 */
export async function prepareLogoForUpload(
  asset: PickedAsset,
): Promise<{ base64: string; mime: string; ext: string }> {
  const w = asset.width ?? 0;
  const h = asset.height ?? 0;
  const ctx = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(w, h);
  if (w > 0 && h > 0 && longest > LOGO_MAX_DIMENSION) {
    const scale = LOGO_MAX_DIMENSION / longest;
    ctx.resize({
      width: Math.round(w * scale),
      height: Math.round(h * scale),
    });
  }
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.PNG, base64: true });
  if (!out.base64) {
    throw new Error("Image processing returned no data.");
  }
  return { base64: out.base64, mime: "image/png", ext: "png" };
}
