import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Pre-check the vendor-gallery image cap before uploading. RLS
// enforces the cap server-side too (see
// 20260523204601_vendor_image_cap_per_tier + later narrowings), but
// uploads that violate the policy come back as cryptic
// "row violates row-level security policy" strings — no upgrade
// hint. This helper checks user_image_cap + user_image_count via
// the public RPCs and pops the friendly "out of room, here's
// upgrade" toast before the upload even attempts.
//
// Returns `false` to indicate "stop, the caller's already toasted
// the user." Returns `true` when the cap allows `addCount` more
// uploads (or when there's no cap = grandfathered).
//
// Used from both /vendor/gallery uploads and Axion's save-to-gallery
// flow so a Free vendor saving an Axion image sees the same upgrade
// prompt as a vendor uploading from the gallery page itself.
export async function ensureGalleryCapacity(
  userId: string,
  addCount: number,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: cntData }, { data: capData }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc("user_image_count", { p_user_id: userId }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc("user_image_cap", { p_user_id: userId }),
  ]);
  const currentCount = typeof cntData === "number" ? cntData : 0;
  const cap = typeof capData === "number" ? capData : null;
  if (cap === null) return true; // grandfathered / unlimited
  if (currentCount + addCount <= cap) return true;

  const remaining = Math.max(0, cap - currentCount);
  toast.error(
    remaining === 0
      ? "You've hit your plan's gallery cap."
      : `Only ${remaining} gallery image${remaining === 1 ? "" : "s"} left on your plan.`,
    {
      description:
        "Upgrade your plan or remove some gallery images. Listing photos aren't affected.",
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
