-- Clear an album's cover_image_id when the underlying image moves to
-- a different album, or gets soft-deleted. Without this trigger the
-- FK reference can persist past the point where it makes semantic
-- sense — the client falls through gracefully, but the FK relationship
-- is wrong in the DB.
--
-- Triggered on every UPDATE OF (album_id, deleted_at) so both
-- moves and soft-deletes get caught.

create or replace function public.tg_vendor_gallery_clear_orphan_cover()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  -- Case 1: image moved to a different album. Any album that had
  -- this image as cover but whose id doesn't match the NEW
  -- album_id should drop the cover designation. (If the image was
  -- the cover of its NEW album already, leave that alone.)
  if old.album_id is distinct from new.album_id then
    update public.vendor_gallery_albums
      set cover_image_id = null
      where cover_image_id = new.id
        and id is distinct from new.album_id;
  end if;

  -- Case 2: image soft-deleted. Drop the cover everywhere it's
  -- referenced. The UI already falls through to a non-deleted
  -- fallback, but the DB shouldn't keep the stale pointer.
  if old.deleted_at is null and new.deleted_at is not null then
    update public.vendor_gallery_albums
      set cover_image_id = null
      where cover_image_id = new.id;
  end if;

  return new;
end;
$$;

revoke execute on function public.tg_vendor_gallery_clear_orphan_cover()
  from public, anon, authenticated;

drop trigger if exists vendor_gallery_clear_orphan_cover on public.vendor_gallery_images;
create trigger vendor_gallery_clear_orphan_cover
  after update of album_id, deleted_at on public.vendor_gallery_images
  for each row
  execute function public.tg_vendor_gallery_clear_orphan_cover();
