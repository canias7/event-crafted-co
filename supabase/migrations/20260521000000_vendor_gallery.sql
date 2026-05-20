-- Vendor gallery — account-level media library for vendors. Distinct
-- from vendor_portfolio_images, which is per-LISTING (a vendor with
-- five listings has five portfolios). The gallery sits one level up:
-- one media pool per vendor account, regardless of how many listings
-- they have. Vendors use it as a curated archive of brand shots,
-- behind-the-scenes images, swatches, past work — content they may
-- later reuse across listings, posts, etc.

create table public.vendor_gallery_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  caption text,
  -- Kept for a future drag-to-reorder pass. Until that lands, the
  -- page sorts by created_at desc and display_order stays 0.
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index vendor_gallery_images_user_idx
  on public.vendor_gallery_images(user_id, created_at desc);

alter table public.vendor_gallery_images enable row level security;

-- Public read so a future "vendor brand gallery" surface on the
-- listing detail page can show the same pool without per-user gating.
create policy "vendor_gallery_images public read"
  on public.vendor_gallery_images for select using (true);

-- Only vendor-role users can author; one user only sees / writes
-- their own rows.
create policy "vendor_gallery_images vendor insert"
  on public.vendor_gallery_images for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles
                 where id = (select auth.uid()) and role = 'vendor')
  );

create policy "vendor_gallery_images owner update"
  on public.vendor_gallery_images for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "vendor_gallery_images owner delete"
  on public.vendor_gallery_images for delete
  using (user_id = (select auth.uid()));

-- Storage cleanup on row delete — drops the underlying file from the
-- vendor-gallery bucket so a row delete frees storage too. Mirrors
-- tg_post_storage_cleanup / tg_reel_storage_cleanup.
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
  v_path := substring(old.image_url from '/storage/v1/object/public/vendor-gallery/(.*)$');
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

drop trigger if exists vendor_gallery_storage_cleanup on public.vendor_gallery_images;
create trigger vendor_gallery_storage_cleanup
  after delete on public.vendor_gallery_images
  for each row execute function public.tg_vendor_gallery_storage_cleanup();

-- Storage bucket + RLS. Mirrors the vendor-posts pattern: public
-- bucket, owner-keyed by folder name = auth.uid().
insert into storage.buckets (id, name, public)
  values ('vendor-gallery', 'vendor-gallery', true)
  on conflict (id) do update set public = excluded.public;

drop policy if exists "vendor-gallery owner write" on storage.objects;
create policy "vendor-gallery owner write"
  on storage.objects for insert
  with check (
    bucket_id = 'vendor-gallery'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "vendor-gallery owner delete" on storage.objects;
create policy "vendor-gallery owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'vendor-gallery'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
