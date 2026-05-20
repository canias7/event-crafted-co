import { supabase } from "@/integrations/supabase/client";

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
