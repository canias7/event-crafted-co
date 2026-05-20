-- Cover image per album. Lets a vendor pick which image represents
-- an album in the tab strip (and any future album-thumbnail surface).
-- on delete set null so deleting the image that's the cover doesn't
-- cascade-destroy the album — it just falls back to the "first image"
-- default the UI uses when cover_image_id is null.

alter table public.vendor_gallery_albums
  add column if not exists cover_image_id uuid
    references public.vendor_gallery_images(id) on delete set null;
