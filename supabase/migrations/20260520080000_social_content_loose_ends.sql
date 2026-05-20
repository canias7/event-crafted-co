-- Loose ends from the social-content migration:
--
-- (1) Re-add storage cleanup triggers on the new posts / reels
--     tables. The old vendor_posts / vendor_reels tables had
--     AFTER DELETE triggers that scrubbed the storage object on
--     row delete; lost in the rename. Without them, host delete
--     of a post / reel leaks the storage file forever. Mirrors
--     tg_vendor_post_storage_cleanup / tg_vendor_reel_storage_cleanup
--     line-for-line — same bucket names (we deliberately didn't
--     rename buckets; they're shared with avatar uploads and
--     touching them would break mobile + edit-profile pages).
--
-- (3) Lock down the legacy vendor_posts / vendor_reels / vendor_buzz
--     tables. Rows were wiped but the INSERT / UPDATE policies
--     still allowed vendor writes — vendors calling the API directly
--     (or vendor-mobile's still-pointed composer) could resurrect
--     content in tables nothing reads anymore. Drop the write
--     policies; SELECT stays open so any still-deployed reader
--     gets empty results instead of a permission error.
--
-- (4) Drop public.post_comments and public.post_comment_likes —
--     created in the rename to mirror the legacy comment tables,
--     but no UI ever consumed comments and the new host-content
--     feature doesn't need them yet. If we add comments later
--     we'll recreate with a cleaner shape (likes on the post
--     itself, not on comments).

create or replace function public.tg_post_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'storage'
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

create or replace function public.tg_reel_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'storage'
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
      exception when others then
        null;
      end;
    end if;
  end if;
  if old.thumbnail_url is not null then
    v_thumb_path := substring(old.thumbnail_url from '/storage/v1/object/public/vendor-reels/(.*)$');
    if v_thumb_path is not null and length(v_thumb_path) > 0 then
      begin
        delete from storage.objects
         where bucket_id = 'vendor-reels' and name = v_thumb_path;
      exception when others then
        null;
      end;
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists posts_storage_cleanup on public.posts;
create trigger posts_storage_cleanup
  after delete on public.posts
  for each row execute function public.tg_post_storage_cleanup();

drop trigger if exists reels_storage_cleanup on public.reels;
create trigger reels_storage_cleanup
  after delete on public.reels
  for each row execute function public.tg_reel_storage_cleanup();

-- (3) Drop write policies on legacy tables. Read stays open.
drop policy if exists "vendor_posts insert own" on public.vendor_posts;
drop policy if exists "vendor_posts update own" on public.vendor_posts;
drop policy if exists "vendor_posts delete own" on public.vendor_posts;
drop policy if exists "vendor_reels insert own" on public.vendor_reels;
drop policy if exists "vendor_reels update own" on public.vendor_reels;
drop policy if exists "vendor_reels delete own" on public.vendor_reels;
drop policy if exists "vendor_buzz insert own" on public.vendor_buzz;
drop policy if exists "vendor_buzz update own" on public.vendor_buzz;
drop policy if exists "vendor_buzz delete own" on public.vendor_buzz;
drop policy if exists "vendor_post_comments owner write" on public.vendor_post_comments;
drop policy if exists "vendor_post_comments owner delete" on public.vendor_post_comments;
drop policy if exists "vendor_post_comment_likes owner write" on public.vendor_post_comment_likes;
drop policy if exists "vendor_post_comment_likes owner delete" on public.vendor_post_comment_likes;

-- (4) Drop unused comment tables.
drop table if exists public.post_comment_likes;
drop table if exists public.post_comments;
