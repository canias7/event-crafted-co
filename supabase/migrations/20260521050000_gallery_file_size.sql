-- file_size_bytes on vendor_gallery_images. Powers:
--   • File size row in the lightbox EXIF panel.
--   • Size column in the gallery list view.
--   • "Large files" smart album (predicate: file_size_bytes > 5 MB).
--
-- Captured client-side at upload time from File.size, and via the
-- backfill loop on older rows that pre-date this column.

alter table public.vendor_gallery_images
  add column if not exists file_size_bytes bigint;
