// Shared helpers for the vendor gallery upload pipeline:
//   • parseExif(file) — extract a sanitized subset of EXIF tags from
//     a File. GPS, maker-notes, and other large blobs are dropped —
//     only the camera/lens/exposure-trio + capture date come through.
//   • computeBlurhash(file) — encode a tiny perceptual hash for the
//     image. Rendered as a canvas placeholder while the real image
//     streams in, eliminates blank-tile flicker.
//   • blurhashToDataUrl(hash, w, h) — decode a hash into a tiny PNG
//     data URL suitable for <img src> until the real image loads.
//   • imageDimensions(file) — quick (width, height) read.
//
// All helpers swallow errors and resolve null. EXIF parsing in
// particular fails for a lot of edge cases (PNG, WebP without EXIF,
// browser inconsistencies) and we just want best-effort metadata.

import { encode, decode } from "blurhash";

// exifr is ~80KB gzip and only used inside parseExif. Lazy-loaded
// on first call so an unauthed visitor browsing the public site
// never downloads it. Cached after first load.
let exifrModulePromise: Promise<typeof import("exifr").default> | null = null;
async function getExifr() {
  if (!exifrModulePromise) {
    exifrModulePromise = import("exifr").then((m) => m.default);
  }
  return exifrModulePromise;
}

export interface SanitizedExif {
  camera_make?: string;
  camera_model?: string;
  lens?: string;
  date_taken?: string; // ISO
  iso?: number;
  aperture?: number;
  shutter?: string; // "1/200" formatted
  focal_length?: number;
  orientation?: number;
  // GPS, when present, in decimal degrees (signed: north/east
  // positive, south/west negative). Shown in the vendor's own
  // gallery EXIF panel — public share downloads still receive the
  // raw file with its embedded GPS unless we later add a strip-
  // on-share toggle.
  gps_lat?: number;
  gps_lon?: number;
}

const EXIF_TAGS = [
  "Make",
  "Model",
  "LensModel",
  "DateTimeOriginal",
  "ISO",
  "FNumber",
  "ExposureTime",
  "FocalLength",
  "Orientation",
];

export async function parseExif(file: File): Promise<SanitizedExif | null> {
  try {
    const exifr = await getExifr();
    // Pick the small whitelist + GPS. exifr returns latitude /
    // longitude pre-computed when `gps: true`.
    const raw = await exifr.parse(file, {
      pick: EXIF_TAGS,
      gps: true,
      tiff: true,
      exif: true,
      iptc: false,
      xmp: false,
    });
    if (!raw) return null;
    const out: SanitizedExif = {};
    if (raw.Make) out.camera_make = String(raw.Make).trim();
    if (raw.Model) out.camera_model = String(raw.Model).trim();
    if (raw.LensModel) out.lens = String(raw.LensModel).trim();
    if (raw.DateTimeOriginal instanceof Date)
      out.date_taken = raw.DateTimeOriginal.toISOString();
    else if (typeof raw.DateTimeOriginal === "string")
      out.date_taken = raw.DateTimeOriginal;
    if (typeof raw.ISO === "number") out.iso = raw.ISO;
    if (typeof raw.FNumber === "number") out.aperture = raw.FNumber;
    if (typeof raw.ExposureTime === "number") {
      const s = raw.ExposureTime;
      if (s >= 1) out.shutter = `${s}s`;
      else out.shutter = `1/${Math.round(1 / s)}`;
    }
    if (typeof raw.FocalLength === "number") out.focal_length = raw.FocalLength;
    if (typeof raw.Orientation === "number") out.orientation = raw.Orientation;
    if (typeof raw.latitude === "number") out.gps_lat = raw.latitude;
    if (typeof raw.longitude === "number") out.gps_lon = raw.longitude;
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export interface ImgInfo {
  width: number;
  height: number;
  blurhash: string | null;
}

export async function computeBlurhash(file: File): Promise<ImgInfo | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const ratio = img.width / img.height;
        // Hash from a 32px-wide downsample. Quality 4x3 components
        // gives a nice gradient without being slow.
        const W = 32;
        const H = Math.max(8, Math.round(W / ratio));
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve({
            width: img.naturalWidth,
            height: img.naturalHeight,
            blurhash: null,
          });
          return;
        }
        ctx.drawImage(img, 0, 0, W, H);
        const pixels = ctx.getImageData(0, 0, W, H);
        let hash: string | null = null;
        try {
          hash = encode(pixels.data, W, H, 4, 3);
        } catch {
          hash = null;
        }
        URL.revokeObjectURL(url);
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
          blurhash: hash,
        });
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

// Cache decoded blurhashes per (hash, target_w, target_h) — decoding
// + canvas → dataURL is cheap but not free, and the same hash often
// renders in multiple tiles (grid + lightbox preview).
//
// LRU-capped at MAX_CACHE entries. A long session over a 5k-image
// gallery can otherwise grow this Map to multiple MB of PNG dataURLs.
// JS Map preserves insertion order so promoting a hit to MRU is a
// delete + set; eviction takes the first key.
const MAX_CACHE = 1000;
const cache = new Map<string, string>();

export function blurhashToDataUrl(
  hash: string,
  width = 32,
  height = 32,
): string | null {
  const key = `${hash}|${width}|${height}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    // Promote to MRU.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  try {
    const pixels = decode(hash, width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
    const url = canvas.toDataURL("image/png");
    cache.set(key, url);
    if (cache.size > MAX_CACHE) {
      // Evict oldest (first inserted, not yet promoted).
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return url;
  } catch {
    return null;
  }
}

export async function imageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
