-- Add storage cleanup triggers for the 5 buckets that previously leaked
-- objects on row delete (audit finding #3):
--
--   vendor-showcase-clips  -> vendor_showcase_clips.video_path / poster_path
--   vendor-verifications   -> vendor_verifications.document_path
--   event-albums           -> event_albums.cover_path + event_album_photos.storage_path
--   mood-board-images      -> mood_board_items.image_url (full URL → strip prefix)
--   message-attachments    -> direct_messages.attachments (jsonb array of {url, kind})
--
-- Pattern matches the existing tg_vendor_post_storage_cleanup and
-- tg_vendor_reel_storage_cleanup in
-- 20260511150000_storage_cleanup_triggers.sql.

-- Helper: strip a Supabase public-storage URL down to the path inside
-- the bucket. Returns NULL if the URL doesn't match the expected shape.
create or replace function public.storage_path_from_public_url(
  p_bucket text,
  p_url    text
) returns text
language sql
immutable
set search_path = public
as $$
  select (regexp_match(
    p_url,
    '/storage/v1/object/public/' || p_bucket || '/(.*?)(?:\?.*)?$'
  ))[1];
$$;

------------------------------------------------------------------------
-- vendor-showcase-clips
------------------------------------------------------------------------
create or replace function public.tg_vendor_showcase_clip_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if old.video_path is not null and old.video_path <> '' then
    delete from storage.objects
      where bucket_id = 'vendor-showcase-clips' and name = old.video_path;
  end if;
  if old.poster_path is not null and old.poster_path <> '' then
    delete from storage.objects
      where bucket_id = 'vendor-showcase-clips' and name = old.poster_path;
  end if;
  return old;
end$function$;

drop trigger if exists vendor_showcase_clips_storage_cleanup on public.vendor_showcase_clips;
create trigger vendor_showcase_clips_storage_cleanup
  after delete on public.vendor_showcase_clips
  for each row execute function public.tg_vendor_showcase_clip_storage_cleanup();

revoke execute on function public.tg_vendor_showcase_clip_storage_cleanup()
  from public, anon, authenticated, service_role;

------------------------------------------------------------------------
-- vendor-verifications
------------------------------------------------------------------------
create or replace function public.tg_vendor_verification_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if old.document_path is not null and old.document_path <> '' then
    delete from storage.objects
      where bucket_id = 'vendor-verifications' and name = old.document_path;
  end if;
  return old;
end$function$;

drop trigger if exists vendor_verifications_storage_cleanup on public.vendor_verifications;
create trigger vendor_verifications_storage_cleanup
  after delete on public.vendor_verifications
  for each row execute function public.tg_vendor_verification_storage_cleanup();

revoke execute on function public.tg_vendor_verification_storage_cleanup()
  from public, anon, authenticated, service_role;

------------------------------------------------------------------------
-- event-albums (two source tables)
------------------------------------------------------------------------
create or replace function public.tg_event_album_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if old.cover_path is not null and old.cover_path <> '' then
    delete from storage.objects
      where bucket_id = 'event-albums' and name = old.cover_path;
  end if;
  return old;
end$function$;

drop trigger if exists event_albums_storage_cleanup on public.event_albums;
create trigger event_albums_storage_cleanup
  after delete on public.event_albums
  for each row execute function public.tg_event_album_storage_cleanup();

revoke execute on function public.tg_event_album_storage_cleanup()
  from public, anon, authenticated, service_role;

create or replace function public.tg_event_album_photo_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if old.storage_path is not null and old.storage_path <> '' then
    delete from storage.objects
      where bucket_id = 'event-albums' and name = old.storage_path;
  end if;
  return old;
end$function$;

drop trigger if exists event_album_photos_storage_cleanup on public.event_album_photos;
create trigger event_album_photos_storage_cleanup
  after delete on public.event_album_photos
  for each row execute function public.tg_event_album_photo_storage_cleanup();

revoke execute on function public.tg_event_album_photo_storage_cleanup()
  from public, anon, authenticated, service_role;

------------------------------------------------------------------------
-- mood-board-images (image_url may be full URL OR raw path)
------------------------------------------------------------------------
create or replace function public.tg_mood_board_item_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare v_path text;
begin
  if old.image_url is null or old.image_url = '' then
    return old;
  end if;
  -- If it's a full Supabase URL we can extract the path; if not, use
  -- it as-is (some uploads pre-date the URL convention).
  v_path := public.storage_path_from_public_url('mood-board-images', old.image_url);
  if v_path is null then v_path := old.image_url; end if;
  delete from storage.objects
    where bucket_id = 'mood-board-images' and name = v_path;
  return old;
end$function$;

drop trigger if exists mood_board_items_storage_cleanup on public.mood_board_items;
create trigger mood_board_items_storage_cleanup
  after delete on public.mood_board_items
  for each row execute function public.tg_mood_board_item_storage_cleanup();

revoke execute on function public.tg_mood_board_item_storage_cleanup()
  from public, anon, authenticated, service_role;

------------------------------------------------------------------------
-- message-attachments (jsonb array of {url, kind})
------------------------------------------------------------------------
create or replace function public.tg_direct_message_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_att jsonb;
  v_url text;
  v_path text;
begin
  if old.attachments is null or jsonb_array_length(coalesce(old.attachments,'[]'::jsonb)) = 0 then
    return old;
  end if;
  for v_att in select jsonb_array_elements(old.attachments) loop
    v_url := v_att->>'url';
    if v_url is null or v_url = '' then continue; end if;
    v_path := public.storage_path_from_public_url('message-attachments', v_url);
    if v_path is null then continue; end if;
    delete from storage.objects
      where bucket_id = 'message-attachments' and name = v_path;
  end loop;
  return old;
end$function$;

drop trigger if exists direct_messages_storage_cleanup on public.direct_messages;
create trigger direct_messages_storage_cleanup
  after delete on public.direct_messages
  for each row execute function public.tg_direct_message_storage_cleanup();

revoke execute on function public.tg_direct_message_storage_cleanup()
  from public, anon, authenticated, service_role;
