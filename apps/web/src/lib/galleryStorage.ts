import { supabase } from "@/integrations/supabase/client";

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
