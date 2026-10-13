// Client-side image re-encode for photo uploads.
//
// Two jobs:
//
// 1. Privacy (every photo upload). Phone photos carry EXIF/XMP
//    metadata, often including the GPS position where they were
//    taken. Our photo buckets are public, so uploading the original
//    bytes would publish that location. stripImageMetadata() decodes
//    the image and re-encodes it through a canvas, which writes pixels
//    only: no EXIF, no GPS, no XMP. Orientation is applied to the
//    pixels first (createImageBitmap with imageOrientation
//    'from-image'), so portrait iPhone shots stay upright after the
//    orientation tag is gone.
//
// 2. Size (listing photos). Vendors upload raw camera-roll photos
//    (3-10 MB at 4032×3024 typical). compressImageIfNeeded() also
//    shrinks large files to MAX_DIMENSION on the longest edge as JPEG
//    at JPEG_QUALITY: a 4 MB iPhone photo becomes ~400 KB.
//
// Failure handling: if the browser can't decode or re-encode, JPEGs
// fall back to a byte-level strip of their metadata segments (APP1
// EXIF/XMP, APP13 IPTC), so location never ships even then. Other
// formats fall back to the original file; canvas decodes PNG and WebP
// in every browser we support, so that path is practically unused.
// GIF (animation would be lost), SVG and video are left untouched.

const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 0.85;
// Quality used when we re-encode only to strip metadata. High enough
// that a second JPEG generation is visually identical.
const STRIP_QUALITY = 0.92;
// Files this size or smaller are only stripped, not downsized: re-
// encoding small images at lower quality makes them visibly blurrier
// without saving meaningful bytes.
const COMPRESS_MIN_BYTES = 500 * 1024;

// HEIC/HEIF/AVIF only decode in some browsers (HEIC: Safari). When
// they do, they come out as JPEG; when they don't, the original goes up
// unchanged, so upload pickers that care should keep rejecting HEIC.
const STRIPPABLE = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
]);

/** True for image types stripImageMetadata tries to re-encode. */
export function isStrippableImage(file: File): boolean {
  return STRIPPABLE.has(file.type.toLowerCase());
}

type OutType = "image/jpeg" | "image/png" | "image/webp";

function extFor(type: OutType): string {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

function renamed(file: File, blob: Blob, type: OutType): File {
  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${baseName}.${extFor(type)}`, {
    type,
    lastModified: file.lastModified,
  });
}

function toBlob(canvas: HTMLCanvasElement, type: OutType, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function reencode(
  file: File,
  opts: { maxDimension?: number; quality: number; forceJpeg?: (w: number, h: number) => boolean },
): Promise<File> {
  const srcType = file.type.toLowerCase();
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = bitmap;
    const max = opts.maxDimension;
    const scale = max && (width > max || height > max) ? Math.min(max / width, max / height) : 1;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);

    // Keep the source format (PNG stays lossless and keeps
    // transparency) unless the caller asked for JPEG.
    let type: OutType =
      srcType === "image/png" ? "image/png" : srcType === "image/webp" ? "image/webp" : "image/jpeg";
    if (opts.forceJpeg?.(width, height)) type = "image/jpeg";

    let blob = await toBlob(canvas, type, opts.quality);
    // A full-size JPEG re-encode can come out bigger than the camera
    // file. One step down in quality brings it back near the original
    // size (and under the upload size limits it already passed).
    if (blob && type === "image/jpeg" && scale === 1 && blob.size > file.size && opts.quality > JPEG_QUALITY) {
      blob = (await toBlob(canvas, type, JPEG_QUALITY)) ?? blob;
    }
    // A browser that can't encode WebP hands back PNG instead.
    if (blob && blob.type && blob.type !== type) type = blob.type as OutType;
    if (!blob) {
      type = "image/png";
      blob = await toBlob(canvas, type, opts.quality);
    }
    if (!blob) throw new Error("canvas.toBlob returned null");
    return renamed(file, blob, type);
  } finally {
    // Release the decoded RGBA pixels right away so parallel workers
    // don't pile hundreds of MB of decoded pixels in memory.
    bitmap?.close();
  }
}

/**
 * Remove EXIF/XMP/IPTC segments from JPEG bytes without touching the
 * image data. Used only when canvas re-encoding fails. The
 * orientation tag goes too, so a rotated photo may show sideways, which
 * beats publishing where it was taken.
 */
export function stripJpegMetadataBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    // Start of scan: the rest is entropy-coded image data. Copy as is.
    if (marker === 0xda) {
      const rest = bytes.subarray(i);
      const merged = new Uint8Array(out.length + rest.length);
      merged.set(out, 0);
      merged.set(rest, out.length);
      return merged;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2 || i + 2 + len > bytes.length) return null;
    // APP1 (EXIF, XMP) and APP13 (IPTC/Photoshop) can carry location.
    const drop = marker === 0xe1 || marker === 0xed;
    if (!drop) {
      for (let j = i; j < i + 2 + len; j++) out.push(bytes[j]);
    }
    i += 2 + len;
  }
  return null;
}

async function fallback(file: File, err: unknown): Promise<File> {
  const type = file.type.toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg" || type === "image/pjpeg") {
    try {
      const stripped = stripJpegMetadataBytes(new Uint8Array(await file.arrayBuffer()));
      if (stripped) {
        console.warn("[imageCompress] re-encode failed, stripped JPEG metadata instead:", err);
        return new File([stripped], file.name, { type: "image/jpeg", lastModified: file.lastModified });
      }
    } catch {
      /* fall through */
    }
  }
  console.warn("[imageCompress] re-encode failed, uploading original:", err);
  return file;
}

/**
 * Re-encode a JPEG/PNG/WebP so the uploaded bytes carry no metadata
 * (no GPS), at full size and high quality, with orientation applied.
 * Other types are returned unchanged.
 */
export async function stripImageMetadata(file: File): Promise<File> {
  if (!isStrippableImage(file)) return file;
  try {
    return await reencode(file, { quality: STRIP_QUALITY });
  } catch (err) {
    return fallback(file, err);
  }
}

/**
 * Listing-photo variant: always strips metadata like stripImageMetadata,
 * and additionally downsizes large files (over 500 KB and over 2400 px)
 * to a 2400 px JPEG.
 */
export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!isStrippableImage(file)) return file;
  const large = file.size >= COMPRESS_MIN_BYTES;
  try {
    return await reencode(file, {
      maxDimension: large ? MAX_DIMENSION : undefined,
      quality: large ? JPEG_QUALITY : STRIP_QUALITY,
      forceJpeg: (w, h) => large && (w > MAX_DIMENSION || h > MAX_DIMENSION),
    });
  } catch (err) {
    return fallback(file, err);
  }
}
