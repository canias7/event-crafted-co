-- Audit fixes for the vendor gallery.
--
-- Critical privacy fix (#1, #2, #3 from the audit):
--   The vendor_gallery_images + vendor_gallery_albums SELECT
--   policies were `using (true)` — meaning any anon caller could
--   enumerate every vendor's full library (URLs, captions, GPS
--   coords in the exif jsonb after the last PR added GPS, etc.)
--   and bypass the public share token + password by querying
--   image_id directly. Tighten both to owner-only.
--
--   The legitimate public-read use case — /g/:token sharing — moves
--   to a new SECURITY DEFINER RPC (`get_share_payload`) that:
--     • validates token + optional password (same exception set as
--       resolve_gallery_share),
--     • returns the share kind + image_url / caption / blurhash /
--       width / height — but NOT exif and NOT file_size_bytes,
--     • for an album share, returns the full array of non-deleted
--       member images in one round-trip.
--   PublicGallerySharePage calls this exclusively now; no more
--   anon SELECTs on the underlying tables.
--
-- #11 — Make the storage cleanup regex robust to URL variations
-- (transforms / signed URLs append query strings). Match against
-- "vendor-gallery/<path>" up to the first `?` instead of pinning
-- the leading `/storage/v1/object/public/` prefix. The bucket
-- name is the stable anchor.

drop policy if exists "vendor_gallery_images public read" on public.vendor_gallery_images;
create policy "vendor_gallery_images owner read"
  on public.vendor_gallery_images for select
  using (user_id = (select auth.uid()));

drop policy if exists "vendor_gallery_albums public read" on public.vendor_gallery_albums;
create policy "vendor_gallery_albums owner read"
  on public.vendor_gallery_albums for select
  using (user_id = (select auth.uid()));

create or replace function public.get_share_payload(
  p_token text,
  p_password text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_share record;
  v_image jsonb;
  v_images jsonb;
  v_album_name text;
begin
  select * into v_share from public.vendor_gallery_shares
   where token = p_token;
  if v_share.id is null then
    raise exception 'not_found';
  end if;
  if v_share.expires_at is not null
     and v_share.expires_at < now() then
    raise exception 'expired';
  end if;
  if v_share.password_hash is not null then
    if p_password is null or length(p_password) = 0 then
      raise exception 'needs_password';
    end if;
    if extensions.crypt(p_password, v_share.password_hash) <> v_share.password_hash then
      raise exception 'bad_password';
    end if;
  end if;

  if v_share.image_id is not null then
    select jsonb_build_object(
      'id', i.id,
      'image_url', i.image_url,
      'caption', i.caption,
      'blurhash', i.blurhash,
      'width', i.width,
      'height', i.height,
      'created_at', i.created_at
    )
      into v_image
      from public.vendor_gallery_images i
     where i.id = v_share.image_id
       and i.deleted_at is null;
    if v_image is null then
      raise exception 'not_found';
    end if;
    return jsonb_build_object(
      'kind', 'image',
      'album_name', null,
      'images', jsonb_build_array(v_image)
    );
  end if;

  if v_share.album_id is not null then
    select name into v_album_name
      from public.vendor_gallery_albums
     where id = v_share.album_id;
    if v_album_name is null then
      raise exception 'not_found';
    end if;
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'image_url', i.image_url,
          'caption', i.caption,
          'blurhash', i.blurhash,
          'width', i.width,
          'height', i.height,
          'created_at', i.created_at
        )
        order by i.display_order, i.created_at desc
      ),
      '[]'::jsonb
    )
      into v_images
      from public.vendor_gallery_images i
     where i.album_id = v_share.album_id
       and i.deleted_at is null;
    return jsonb_build_object(
      'kind', 'album',
      'album_name', v_album_name,
      'images', v_images
    );
  end if;

  raise exception 'not_found';
end;
$$;

grant execute on function public.get_share_payload(text, text) to anon, authenticated;

-- Robust storage cleanup: match the bucket path regardless of URL
-- prefix or trailing query strings. Stops files leaking on row
-- delete if a transformed / signed URL ever ends up in image_url.
create or replace function public.tg_vendor_gallery_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'storage'
as $$
declare
  v_path text;
begin
  if old.image_url is null then return old; end if;
  v_path := substring(old.image_url from 'vendor-gallery/([^?]+)');
  if v_path is null or length(v_path) = 0 then return old; end if;
  begin
    delete from storage.objects
     where bucket_id = 'vendor-gallery' and name = v_path;
  exception when others then
    null;
  end;
  return old;
end;
$$;

-- #12 from the audit — realtime subscriptions on the gallery
-- tables so multi-tab / multi-device sessions stay in sync. The
-- publication needs to know about the tables before clients can
-- subscribe via postgres_changes. Owner-only SELECT RLS above
-- still applies — subscribers only see changes to their own rows.
do $$ begin
  begin
    alter publication supabase_realtime add table public.vendor_gallery_images;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.vendor_gallery_albums;
  exception when duplicate_object then null; end;
end $$;
