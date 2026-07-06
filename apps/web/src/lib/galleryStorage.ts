import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Gallery caps are STORAGE-BASED (bytes in the vendor-gallery
// bucket), per the Free / Pro / Premium plan model:
//   Free 100 MB · Pro 1 GB · Premium 5 GB · grandfathered = uncapped.
// Listing/portfolio photos live in vendor-portfolios and are NOT
// counted. Enforced server-side by the "vendor gallery storage cap"
// policy on storage.objects; these helpers exist so the client can
// pop a friendly "out of room, here's upgrade" toast instead of
// letting the RLS reject leak a cryptic error.

export interface GalleryStorageStatus {
  usedBytes: number;
  /** null = unlimited (grandfathered). */
  capBytes: number | null;
}

export async function getGalleryStorageStatus(
  userId: string,
): Promise<GalleryStorageStatus | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "gallery_storage_status",
    { p_user_id: userId },
  );
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    usedBytes: Number(row.used_bytes ?? 0),
    capBytes: row.cap_bytes === null ? null : Number(row.cap_bytes),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// Pre-check the vendor-gallery storage cap before uploading.
// `addBytes` is the total size of the incoming files. Returns
// `false` to indicate "stop, the caller's already toasted the
// user." Returns `true` when the cap allows the upload (or when
// there's no cap = grandfathered).
export async function ensureGalleryCapacity(
  userId: string,
  addBytes: number,
): Promise<boolean> {
  const status = await getGalleryStorageStatus(userId);
  // Fail open on RPC error — the storage RLS policy is the real
  // enforcement; worst case the vendor sees its (uglier) error.
  if (!status || status.capBytes === null) return true;
  if (status.usedBytes + addBytes <= status.capBytes) return true;

  const remaining = Math.max(0, status.capBytes - status.usedBytes);
  toast.error(
    remaining === 0
      ? "You've used all your plan's gallery storage."
      : `Only ${formatBytes(remaining)} of gallery storage left on your plan.`,
    {
      description:
        "Upgrade your plan or remove some gallery images (emptying Trash frees space too). Listing photos aren't affected.",
      action: {
        label: "Upgrade",
        onClick: () => {
          window.location.href = "/vendor/subscription";
        },
      },
      duration: 8000,
    },
  );
  return false;
}

// Public-URL → storage path. Public URLs look like
// https://<project>.supabase.co/storage/v1/object/public/vendor-gallery/<user_id>/<file>
// — anything after the bucket segment is what supabase.storage.remove
// wants. Returns null if the URL doesn't match the expected shape (so
// callers can skip the storage call without throwing).
export function galleryStoragePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = "/vendor-gallery/";
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const path = url.slice(idx + marker.length);
  return path || null;
}

// Hard-delete an image's storage object after we've removed its
// vendor_gallery_images row. Fire-and-forget; if it fails the row's
// already gone so worst case we leak a file (cleanup-gallery-orphans
// edge function sweeps those).
export async function purgeGalleryStorageObject(
  url: string | null | undefined,
): Promise<void> {
  const path = galleryStoragePathFromUrl(url ?? null);
  if (!path) return;
  await removeGalleryFileWithRetry(path);
}

// Bulk variant — single storage.remove call with all paths.
export async function purgeGalleryStorageObjects(
  urls: Array<string | null | undefined>,
): Promise<void> {
  const paths = urls
    .map((u) => galleryStoragePathFromUrl(u ?? null))
    .filter((p): p is string => Boolean(p));
  if (paths.length === 0) return;
  try {
    const { error } = await supabase.storage
      .from("vendor-gallery")
      .remove(paths);
    if (error) console.warn("[gallery] bulk storage remove failed", error);
  } catch (err) {
    console.warn("[gallery] bulk storage remove threw", err);
  }
}

// Storage remove with exponential backoff. Transient network errors
// otherwise leak files in the `vendor-gallery` bucket forever — there's
// no batch cleanup job downstream. Used after a failed insert (orphan
// upload) and after a successful edit (old version of the image).
//
// Resolves either way — caller treats this as fire-and-forget. The
// internal try/catch swallows network-level throws (vs. API-returned
// errors) so an unhandled promise rejection never bubbles out.
export async function removeGalleryFileWithRetry(
  path: string,
  attempts = 3,
): Promise<void> {
  let delay = 500;
  for (let i = 0; i < attempts; i++) {
    try {
      const { error } = await supabase.storage
        .from("vendor-gallery")
        .remove([path]);
      if (!error) return;
      if (i === attempts - 1) {
        console.warn("[gallery] storage remove failed", path, error);
        return;
      }
    } catch (err) {
      if (i === attempts - 1) {
        console.warn("[gallery] storage remove threw", path, err);
        return;
      }
    }
    await new Promise((r) => setTimeout(r, delay));
    delay *= 2;
  }
}
