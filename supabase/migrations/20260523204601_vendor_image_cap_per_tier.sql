-- Per-tier image cap on vendor uploads.
--
-- Storage on Supabase is metered (per GB stored + per GB egress).
-- Without a cap, a Free vendor can spam thousands of photos with no
-- offsetting revenue. This enforces:
--   free    -> 100 images
--   starter -> 500 images
--   pro     -> 1,200 images
--   studio  -> 2,000 images
--
-- (Numbers are recalibrated later in this same chain — see
-- starter_gallery_cap_250, pro_gallery_cap_1000, free_tier_no_gallery.)
--
-- Implementation note: we can't add a BEFORE INSERT trigger on
-- storage.objects from the migration role (permission denied for
-- schema storage). RLS RESTRICTIVE policies are the available
-- mechanism. Existing PERMISSIVE policies still grant per-bucket
-- write access; the RESTRICTIVE policy below applies an AND
-- alongside them that rejects the insert once the user is at cap.
--
-- Scope: all vendor-owned media buckets (portfolios, gallery, posts,
-- reels, showcase clips). MIME-filtered to image/* — videos in
-- vendor-reels are a separate concern. (Later narrowed to just
-- vendor-gallery in image_cap_gallery_only.)
--
-- Bypass paths:
--   - service_role (admin bulk import, edge fns) — RLS not enforced
--     on service_role at all.
--   - is_admin() — moderation can drop fixtures regardless of tier.
--   - profiles.unlimited_listings = true — grandfathered whitelist
--     also unlocks image cap, same as listing cap.
--
-- Existing vendors over their tier cap: NOT retroactively blocked
-- from viewing or keeping their images. Policy fires on INSERT
-- only — they just can't add more until they delete some or upgrade.

create or replace function public.user_image_cap(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_unlimited boolean;
  v_max_tier text;
begin
  select unlimited_listings into v_unlimited
    from public.profiles
   where id = p_user_id;
  if v_unlimited = true then
    return null;
  end if;

  select subscription_tier into v_max_tier
    from public.vendor_profiles
   where user_id = p_user_id
   order by case subscription_tier
     when 'studio'  then 4
     when 'pro'     then 3
     when 'starter' then 2
     when 'free'    then 1
     else 0
   end desc
   limit 1;

  v_max_tier := coalesce(v_max_tier, 'free');

  if    v_max_tier = 'studio'  then return 2000;
  elsif v_max_tier = 'pro'     then return 1200;
  elsif v_max_tier = 'starter' then return 500;
  else                              return 100;
  end if;
end;
$$;

-- Companion: count the user's current images across the metered
-- buckets. Pulled out as a function so both the policy and the UI
-- can call it (the UI exposes "X / Y images used").
create or replace function public.user_image_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, storage
as $$
  select count(*)::int
    from storage.objects
   where owner = p_user_id
     and bucket_id in (
       'vendor-portfolios',
       'vendor-gallery',
       'vendor-posts',
       'vendor-reels',
       'vendor-showcase-clips'
     )
     and coalesce(metadata->>'mimetype', '') like 'image/%';
$$;

grant execute on function public.user_image_cap(uuid) to anon, authenticated, service_role;
grant execute on function public.user_image_count(uuid) to anon, authenticated, service_role;

drop policy if exists "vendor image cap" on storage.objects;

create policy "vendor image cap" on storage.objects as restrictive for insert with check (
  bucket_id not in (
    'vendor-portfolios','vendor-gallery','vendor-posts','vendor-reels','vendor-showcase-clips'
  )
  or coalesce(metadata->>'mimetype', '') not like 'image/%'
  or public.is_admin()
  or public.user_image_cap(coalesce(owner, auth.uid())) is null
  or public.user_image_count(coalesce(owner, auth.uid())) < public.user_image_cap(coalesce(owner, auth.uid()))
);
