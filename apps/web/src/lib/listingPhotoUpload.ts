// Helpers for uploading listing portfolio photos. Shared between the
// new-listing wizard and the edit-listing modal so both honor the
// same file-size cap, the same parallel-upload concurrency, and the
// same progress reporting.
//
// Why parallel: a sequential for-loop over 100 photos at 1-5s per
// upload meant vendors stared at "Submitting…" for 5-10 minutes
// (each .upload() awaits a full round trip). Concurrency: 5 cuts
// the wall-clock to ~10s for typical 100-file batches without
// hammering Supabase's per-customer rate limits.
//
// Why a size cap: there's no client-side ceiling otherwise. A photo
// from a recent iPhone is ~3-8MB; a screen recording or raw image
// can be 50MB+. 100 unbounded uploads can easily blow past 2GB,
// fail mid-flight, and trigger the rollback path. We cap at 10MB
// per file (still generous for any vendor photo) and surface
// rejected files in a single toast.

import { supabase } from "@/integrations/supabase/client";

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const UPLOAD_CONCURRENCY = 5;

export interface FileValidationResult {
  accepted: File[];
  rejected: Array<{ file: File; reason: "size" | "type" | "heic" }>;
}

function looksLikeHeic(file: File): boolean {
  // iPhone photos default to .HEIC (or .HEIF). The MIME is often
  // 'image/heic' / 'image/heif' but Safari sometimes reports empty
  // type for them. Fall back to the extension on the filename when
  // the MIME is missing. Supabase storage accepts the upload but
  // most browsers can't render HEIC, so the photo would look broken
  // on the public listing page — better to reject up front with a
  // clear hint than ship a "broken image" UX.
  const t = (file.type || "").toLowerCase();
  if (t === "image/heic" || t === "image/heif") return true;
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif");
}

export function validateListingPhotos(
  incoming: File[],
  alreadyAccepted: number,
  cap: number,
): FileValidationResult {
  const accepted: File[] = [];
  const rejected: FileValidationResult["rejected"] = [];
  const remaining = Math.max(0, cap - alreadyAccepted);
  for (const file of incoming) {
    if (looksLikeHeic(file)) {
      rejected.push({ file, reason: "heic" });
      continue;
    }
    // Allow empty-MIME files only if the extension says image (a few
    // older Safari versions strip MIME on .jpg from camera roll).
    if (!file.type.startsWith("image/") && file.type !== "") {
      rejected.push({ file, reason: "type" });
      continue;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      rejected.push({ file, reason: "size" });
      continue;
    }
    if (accepted.length >= remaining) break;
    accepted.push(file);
  }
  return { accepted, rejected };
}

export interface UploadProgress {
  done: number;
  total: number;
}

export interface UploadedPhoto {
  storagePath: string;
  index: number;
}

// Upload a batch of files to vendor-portfolios under {vendorId}/...
// in parallel with a concurrency cap. The index field on each
// result mirrors the input order so the caller can preserve
// display_order when inserting vendor_portfolio_images rows.
// Sentinel error thrown by uploadListingPhotos when shouldCancel
// returns true between files. Distinct from network/storage errors
// so the modal catch block can suppress the scary "Submit failed"
// toast on a deliberate user abort.
export class UploadCancelledError extends Error {
  constructor() {
    super("upload_cancelled");
    this.name = "UploadCancelledError";
  }
}

export async function uploadListingPhotos(
  vendorId: string,
  files: File[],
  startIndex: number,
  onProgress?: (p: UploadProgress) => void,
  shouldCancel?: () => boolean,
): Promise<{ paths: string[]; results: UploadedPhoto[] }> {
  if (files.length === 0) return { paths: [], results: [] };
  const results: UploadedPhoto[] = new Array(files.length);
  const paths: string[] = [];
  let done = 0;
  const total = files.length;
  let cursor = 0;
  async function worker() {
    while (true) {
      // Bail before grabbing the next file when the modal has been
      // closed mid-upload. Each worker checks per iteration so an
      // abort signaled while one file is in flight still stops the
      // remaining files from queueing.
      if (shouldCancel?.()) throw new UploadCancelledError();
      const myIndex = cursor++;
      if (myIndex >= files.length) return;
      const file = files[myIndex];
      const ext =
        file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "jpg";
      // Date.now() + index keeps paths unique even within a 1ms
      // window. Adding startIndex lets the caller offset (used by
      // the edit modal when appending after existing photos).
      const storagePath =
        `${vendorId}/${Date.now()}-${startIndex + myIndex}-${myIndex}.${ext}`;
      const { error } = await supabase.storage
        .from("vendor-portfolios")
        .upload(storagePath, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
      if (error) throw error;
      paths.push(storagePath);
      results[myIndex] = { storagePath, index: startIndex + myIndex };
      done++;
      onProgress?.({ done, total });
    }
  }
  const workers = Array.from(
    { length: Math.min(UPLOAD_CONCURRENCY, files.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return { paths, results };
}

export function describeRejected(rejected: FileValidationResult["rejected"]): string | null {
  if (rejected.length === 0) return null;
  const tooBig = rejected.filter((r) => r.reason === "size").length;
  const wrongType = rejected.filter((r) => r.reason === "type").length;
  const heic = rejected.filter((r) => r.reason === "heic").length;
  const parts: string[] = [];
  if (tooBig > 0) parts.push(`${tooBig} over 10 MB`);
  if (wrongType > 0) parts.push(`${wrongType} not images`);
  if (heic > 0) {
    parts.push(
      `${heic} HEIC (iPhone) — convert to JPEG in the Photos app share menu`,
    );
  }
  return `Skipped ${parts.join("; ")}.`;
}
