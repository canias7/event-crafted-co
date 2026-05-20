-- Albums for the vendor gallery. Flat list (no nesting), scoped to
-- the vendor's user account. Images without an album are surfaced
-- under "Uncategorized" / "All" in the UI. Album delete keeps the
-- images alive — they fall back to album_id = null — instead of
-- cascading the file deletion, since deleting an album label is
-- usually an organizational decision, not a "destroy this work"
-- decision.

create table public.vendor_gallery_albums (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index vendor_gallery_albums_user_idx
  on public.vendor_gallery_albums(user_id, display_order asc, created_at desc);

alter table public.vendor_gallery_albums enable row level security;

create policy "vendor_gallery_albums public read"
  on public.vendor_gallery_albums for select using (true);

create policy "vendor_gallery_albums vendor insert"
  on public.vendor_gallery_albums for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles
                 where id = (select auth.uid()) and role = 'vendor')
  );

create policy "vendor_gallery_albums owner update"
  on public.vendor_gallery_albums for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "vendor_gallery_albums owner delete"
  on public.vendor_gallery_albums for delete
  using (user_id = (select auth.uid()));

alter table public.vendor_gallery_images
  add column if not exists album_id uuid
    references public.vendor_gallery_albums(id) on delete set null;

create index if not exists vendor_gallery_images_album_idx
  on public.vendor_gallery_images(album_id, display_order asc, created_at desc)
  where album_id is not null;
