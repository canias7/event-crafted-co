-- Vendor team members — owner + staff who appear on the public profile.
-- Each row optionally carries a face photo stored in the existing
-- vendor-portfolios bucket under "<vendor_id>/team/<uuid>.<ext>". The
-- existing storage policies already cover that path: vendors can only
-- write to objects whose first folder component matches their own
-- vendor_profiles.id.

create table public.vendor_team_bios (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  display_name text not null,
  role text,
  bio text,
  /** Bucket-relative key inside vendor-portfolios; nullable. */
  photo_storage_path text,
  /** True for owner / founder / lead. Card renders an "Owner" pill. */
  is_owner boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index vendor_team_bios_vendor_idx
  on public.vendor_team_bios (vendor_id, display_order, created_at);

alter table public.vendor_team_bios enable row level security;

create policy "vendor_team_bios public read"
  on public.vendor_team_bios for select
  using (true);

create policy "vendor_team_bios owner insert"
  on public.vendor_team_bios for insert
  to authenticated
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create policy "vendor_team_bios owner update"
  on public.vendor_team_bios for update
  to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create policy "vendor_team_bios owner delete"
  on public.vendor_team_bios for delete
  to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );
