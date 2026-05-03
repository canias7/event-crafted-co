-- Vendor portfolio images. Storage bucket holds the binaries; metadata
-- (caption + display_order) lives in a separate table so we can sort and
-- annotate without touching object storage.

-- Public bucket so the directory + detail pages can render thumbnails to
-- anonymous visitors. Owner-only write/delete enforced by storage policies.
insert into storage.buckets (id, name, public)
values ('vendor-portfolios', 'vendor-portfolios', true)
on conflict (id) do nothing;

-- Public read across the bucket (the bucket is also public-flagged, but an
-- explicit policy keeps behavior consistent across self-hosted setups).
create policy "vendor portfolios public read"
  on storage.objects for select
  using (bucket_id = 'vendor-portfolios');

-- Vendors can write only to a folder named with their own vendor_profiles.id.
-- storage.foldername(name) splits the object name on '/' and returns the
-- path components — first element is the vendor folder.
create policy "vendor portfolios owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'vendor-portfolios'
    and exists (
      select 1 from public.vendor_profiles vp
      where vp.id::text = (storage.foldername(name))[1]
        and vp.user_id = auth.uid()
    )
  );

create policy "vendor portfolios owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'vendor-portfolios'
    and exists (
      select 1 from public.vendor_profiles vp
      where vp.id::text = (storage.foldername(name))[1]
        and vp.user_id = auth.uid()
    )
  );

-- Image metadata table. storage_path is the bucket-relative key
-- ("<vendor_id>/<uuid>.<ext>"). Public read so the directory shows
-- portfolios; only the owning vendor can mutate.
create table public.vendor_portfolio_images (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  storage_path text not null,
  caption text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index vendor_portfolio_images_vendor_idx
  on public.vendor_portfolio_images (vendor_id, display_order, created_at);

alter table public.vendor_portfolio_images enable row level security;

create policy "vendor_portfolio_images public read"
  on public.vendor_portfolio_images for select
  using (true);

create policy "vendor_portfolio_images owner insert"
  on public.vendor_portfolio_images for insert
  to authenticated
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create policy "vendor_portfolio_images owner update"
  on public.vendor_portfolio_images for update
  to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create policy "vendor_portfolio_images owner delete"
  on public.vendor_portfolio_images for delete
  to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );
