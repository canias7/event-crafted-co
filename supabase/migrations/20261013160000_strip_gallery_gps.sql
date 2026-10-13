-- Remove GPS location from gallery EXIF already saved in the database.
--
-- Until now the web gallery uploader stored the photo's GPS position in
-- vendor_gallery_images.exif (gps_lat / gps_lon). The uploader no longer
-- reads GPS at all; this clears what earlier uploads left behind.
--
-- Deletes every top-level key that starts with "gps" (any case: gps_lat,
-- gps_lon, GPSLatitude, ...) plus bare latitude / longitude / altitude.
-- Idempotent: rows without such keys are not touched, so a re-run updates
-- nothing.
--
-- The image files themselves (public vendor-gallery bucket) still hold the
-- EXIF of the original upload; SQL can't rewrite them.

update public.vendor_gallery_images g
set exif = g.exif - array(
  select k
  from jsonb_object_keys(g.exif) as k
  where k ilike 'gps%' or lower(k) in ('latitude', 'longitude', 'altitude')
)
where jsonb_typeof(g.exif) = 'object'
  and exists (
    select 1
    from jsonb_object_keys(g.exif) as k
    where k ilike 'gps%' or lower(k) in ('latitude', 'longitude', 'altitude')
  );
