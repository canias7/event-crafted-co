// Client-side image resize + re-encode for listing photo uploads.
//
// Why this exists: vendors upload raw camera-roll photos from iPhones
// (3-10 MB each at 4032×3024 pixels typical), so a 100-photo listing
// was ~500 MB-1 GB of storage and bandwidth on every upload. We
// display portfolio images at most ~1600px wide on a 4k retina
// monitor, so the original resolution is pure waste.
//
// Approach: shrink to MAX_DIMENSION (2400 px on the longest edge)
// and re-encode as JPEG at JPEG_QUALITY. Typical result: a 4 MB
// iPhone photo → ~400 KB JPEG. ~10× storage + bandwidth saving with
// no perceptible quality loss for portfolio thumbnails / lightbox.
//
// Best-effort: any failure (decode error, OOM in canvas, weird
// format) falls back to the original file so the upload still
// happens. We never block an upload on compression.

const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 0.85;
// Skip files this size or smaller — they're already well-optimized
// and re-encoding small images often makes them larger or visibly
// blurrier without saving meaningful bytes.
const COMPRESS_MIN_BYTES = 500 * 1024;

// Compression preserves the source's EXIF rotation via
// createImageBitmap({ imageOrientation: 'from-image' }) — iPhone
// portrait photos have an orientation flag in EXIF and we want
// the rendered image rotated correctly, not stored sideways.

export async function compressImageIfNeeded(file: File): Promise<File> {
  if (file.size < COMPRESS_MIN_BYTES) return file;
  // GIFs would lose animation; SVGs don't have raster pixels;
  // HEIC is already rejected upstream by validateListingPhotos.
  // Everything else canvas can handle.
  const type = file.type.toLowerCase();
  if (type === "image/gif" || type === "image/svg+xml") return file;
  if (!type.startsWith("image/")) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = bitmap;
    if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
      // Already small enough; the size-based gate above only catches
      // bytes, not dimensions. A small-bytes-but-large-pixels file
      // is rare but possible (extreme JPEG compression).
      return file;
    }
    const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    const newWidth = Math.round(width * scale);
    const newHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;
    // Only adopt the compressed version if it actually saved bytes.
    // Re-encoding can occasionally produce a bigger file (already-
    // optimized PNG → JPEG of mostly-flat colors, etc).
    if (blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch (err) {
    console.warn("[imageCompress] falling back to original:", err);
    return file;
  } finally {
    // Release the decoded RGBA pixels immediately so 5 parallel
    // workers compressing 10 MB photos don't pile ~250 MB of
    // decoded pixel data in memory at once.
    bitmap?.close();
  }
}
