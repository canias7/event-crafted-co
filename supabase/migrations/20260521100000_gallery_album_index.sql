-- Composite partial index for the album-tab query
--   where album_id = $1 and deleted_at is null
-- The existing indexes on (user_id, created_at), (album_id), and the
-- (user_id, deleted_at) partial don't fully cover this combination —
-- Postgres uses the album_id index then filters deleted_at in memory.
-- Negligible at small scale, real cost as vendor galleries grow.
--
-- Partial on `deleted_at is null` keeps the index small (we never
-- query "deleted images in album X" — trash is collected across
-- albums).

create index if not exists vendor_gallery_images_album_deleted_idx
  on public.vendor_gallery_images (album_id, created_at desc)
  where deleted_at is null;
