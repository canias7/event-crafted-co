-- Delete the underlying storage object whenever a vendor portfolio image,
-- post, or reel row is removed. Without these triggers every "delete this
-- photo / clip" call leaks the bytes in storage forever, growing the bill
-- and orphaning files in the public buckets.
--
-- Three rows store the asset location differently:
--   * vendor_portfolio_images.storage_path -> bare path inside vendor-portfolios
--   * vendor_posts.image_url               -> full https://.../vendor-posts/<path>
--   * vendor_reels.video_url/thumbnail_url -> full https://.../<bucket>/<path>
--
-- We extract the in-bucket path with substring(... from '...public/<bucket>/(.*)$').
-- The DELETE is wrapped in BEGIN/EXCEPTION so a missing object (already
-- gone, race with cron, manual cleanup) never aborts the row delete.

create or replace function public.tg_vendor_portfolio_image_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if old.storage_path is null or length(trim(old.storage_path)) = 0 then
    return old;
  end if;

  begin
    delete from storage.objects
     where bucket_id = 'vendor-portfolios'
       and name = old.storage_path;
  exception when others then
    null; -- best-effort
  end;
  return old;
end;
$$;

drop trigger if exists vendor_portfolio_images_storage_cleanup
  on public.vendor_portfolio_images;
create trigger vendor_portfolio_images_storage_cleanup
  after delete on public.vendor_portfolio_images
  for each row execute function public.tg_vendor_portfolio_image_storage_cleanup();


create or replace function public.tg_vendor_post_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_path text;
begin
  if old.image_url is null then return old; end if;
  v_path := substring(old.image_url from '/storage/v1/object/public/vendor-posts/(.*)$');
  if v_path is null or length(v_path) = 0 then return old; end if;

  begin
    delete from storage.objects
     where bucket_id = 'vendor-posts' and name = v_path;
  exception when others then
    null;
  end;
  return old;
end;
$$;

drop trigger if exists vendor_posts_storage_cleanup on public.vendor_posts;
create trigger vendor_posts_storage_cleanup
  after delete on public.vendor_posts
  for each row execute function public.tg_vendor_post_storage_cleanup();


create or replace function public.tg_vendor_reel_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_video_path text;
  v_thumb_path text;
begin
  if old.video_url is not null then
    v_video_path := substring(old.video_url from '/storage/v1/object/public/vendor-reels/(.*)$');
    if v_video_path is not null and length(v_video_path) > 0 then
      begin
        delete from storage.objects
         where bucket_id = 'vendor-reels' and name = v_video_path;
      exception when others then null; end;
    end if;
  end if;

  if old.thumbnail_url is not null then
    v_thumb_path := substring(old.thumbnail_url from '/storage/v1/object/public/vendor-reels/(.*)$');
    if v_thumb_path is not null and length(v_thumb_path) > 0 then
      begin
        delete from storage.objects
         where bucket_id = 'vendor-reels' and name = v_thumb_path;
      exception when others then null; end;
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists vendor_reels_storage_cleanup on public.vendor_reels;
create trigger vendor_reels_storage_cleanup
  after delete on public.vendor_reels
  for each row execute function public.tg_vendor_reel_storage_cleanup();


revoke execute on function public.tg_vendor_portfolio_image_storage_cleanup() from public, anon, authenticated;
revoke execute on function public.tg_vendor_post_storage_cleanup() from public, anon, authenticated;
revoke execute on function public.tg_vendor_reel_storage_cleanup() from public, anon, authenticated;
