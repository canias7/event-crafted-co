-- Vendor showcase clips: short vertical videos (15-60s) on the vendor's
-- profile that hosts can scroll through TikTok-style. Differs from the
-- existing `intro_video_url` (which is a single long-form embed): clips
-- are bite-sized highlights — a couple's first dance, a finished cake,
-- a venue at sunset.
--
-- Public storage bucket so anonymous browsers can autoplay; mutations
-- gated on vendor_team membership.

insert into storage.buckets (id, name, public)
values ('vendor-showcase-clips', 'vendor-showcase-clips', true)
on conflict (id) do nothing;

create policy "vendor showcase clips public read"
  on storage.objects for select
  using (bucket_id = 'vendor-showcase-clips');

create policy "vendor showcase clips owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'vendor-showcase-clips'
    and exists (
      select 1 from public.vendor_profiles vp
      where vp.id::text = (storage.foldername(name))[1]
        and vp.user_id = auth.uid()
    )
  );

create policy "vendor showcase clips owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'vendor-showcase-clips'
    and exists (
      select 1 from public.vendor_profiles vp
      where vp.id::text = (storage.foldername(name))[1]
        and vp.user_id = auth.uid()
    )
  );

-- Metadata table. video_path is bucket-relative ("<vendor_id>/<uuid>.mp4").
-- poster_path optional — vendors can upload a still or we leave the video
-- to render its first frame. caption is short (think hashtag-line, not paragraph).
create table public.vendor_showcase_clips (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  video_path text not null,
  poster_path text,
  caption text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index vendor_showcase_clips_vendor_idx
  on public.vendor_showcase_clips (vendor_id, display_order, created_at);

alter table public.vendor_showcase_clips enable row level security;

-- Public read: anonymous visitors browsing the directory.
create policy "vendor_showcase_clips public read"
  on public.vendor_showcase_clips for select using (true);

create policy "vendor_showcase_clips member insert"
  on public.vendor_showcase_clips for insert to authenticated
  with check (public.is_vendor_member(vendor_id));

create policy "vendor_showcase_clips member update"
  on public.vendor_showcase_clips for update to authenticated
  using (public.is_vendor_member(vendor_id));

create policy "vendor_showcase_clips member delete"
  on public.vendor_showcase_clips for delete to authenticated
  using (public.is_vendor_member(vendor_id));
