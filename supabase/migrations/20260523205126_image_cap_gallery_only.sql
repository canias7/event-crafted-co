-- Narrow the per-tier image cap to vendor-gallery only.
--
-- The original migration counted images across all vendor media
-- buckets (portfolios, gallery, posts, reels). That penalised
-- vendors with rich listings — listing photos in vendor-portfolios
-- are tied to specific listings, not a vendor's "image library."
-- The cap is meant to gate the standalone gallery surface, not
-- choke listing-builder photo uploads.
--
-- New scope: vendor-gallery bucket only. Portfolios, posts, reels,
-- and showcase clips are unrestricted (still bounded by Supabase's
-- per-project quota, but not by per-tier app rules).

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
     and bucket_id = 'vendor-gallery'
     and coalesce(metadata->>'mimetype', '') like 'image/%';
$$;

-- Replace the RLS RESTRICTIVE policy so it only fires on
-- vendor-gallery inserts.
drop policy if exists "vendor image cap" on storage.objects;

create policy "vendor image cap" on storage.objects as restrictive for insert with check (
  bucket_id <> 'vendor-gallery'
  or coalesce(metadata->>'mimetype', '') not like 'image/%'
  or public.is_admin()
  or public.user_image_cap(coalesce(owner, auth.uid())) is null
  or public.user_image_count(coalesce(owner, auth.uid())) < public.user_image_cap(coalesce(owner, auth.uid()))
);
