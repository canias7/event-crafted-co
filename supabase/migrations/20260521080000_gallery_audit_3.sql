-- Audit fixes round 3.
--
-- 1. Lock down tg_vendor_gallery_storage_cleanup. Postgres grants
--    EXECUTE to PUBLIC on every new function by default, so the
--    trigger function was reachable at /rest/v1/rpc/... It would
--    error out in practice (the OLD record isn't bound outside a
--    trigger context), but the security advisor flagged it as
--    needless surface area. Trigger functions belong to the
--    trigger only.
--
-- 5. Paginate the album share payload. The previous get_share_payload
--    returned every image in the album as one jsonb_agg row.
--    Tolerable for small albums; a 1000-image share would be a
--    multi-MB response. Add p_offset + p_limit params (default
--    offset=0, limit=200) and surface a `total` count + `has_more`
--    flag so the public viewer can lazy-load past the first page.

revoke execute on function public.tg_vendor_gallery_storage_cleanup()
  from public, anon, authenticated;

drop function if exists public.get_share_payload(text, text);
create or replace function public.get_share_payload(
  p_token text,
  p_password text default null,
  p_offset int default 0,
  p_limit int default 200
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
  v_total int;
  v_eff_limit int;
  v_eff_offset int;
begin
  v_eff_limit := greatest(1, least(coalesce(p_limit, 200), 500));
  v_eff_offset := greatest(0, coalesce(p_offset, 0));

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
      'images', jsonb_build_array(v_image),
      'total', 1,
      'offset', 0,
      'limit', 1,
      'has_more', false
    );
  end if;

  if v_share.album_id is not null then
    select name into v_album_name
      from public.vendor_gallery_albums
     where id = v_share.album_id;
    if v_album_name is null then
      raise exception 'not_found';
    end if;
    select count(*) into v_total
      from public.vendor_gallery_images i
     where i.album_id = v_share.album_id
       and i.deleted_at is null;
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
      ),
      '[]'::jsonb
    )
      into v_images
      from (
        select i.id, i.image_url, i.caption, i.blurhash, i.width, i.height, i.created_at
          from public.vendor_gallery_images i
         where i.album_id = v_share.album_id
           and i.deleted_at is null
         order by i.display_order, i.created_at desc
         offset v_eff_offset
         limit v_eff_limit
      ) i;
    return jsonb_build_object(
      'kind', 'album',
      'album_name', v_album_name,
      'images', v_images,
      'total', v_total,
      'offset', v_eff_offset,
      'limit', v_eff_limit,
      'has_more', v_eff_offset + v_eff_limit < v_total
    );
  end if;

  raise exception 'not_found';
end;
$$;

grant execute on function public.get_share_payload(text, text, int, int) to anon, authenticated;
