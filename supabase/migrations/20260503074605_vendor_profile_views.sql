-- Profile-view tracking. Each visit to /vendors/:id from a real browser
-- writes a row; the dashboard aggregates counts. Public insert (anyone
-- can record a view) — cheap, but worth revisiting if abuse becomes a
-- problem (rate-limit via a simple time-since-last-from-same-ip check
-- can be added later).

create table public.vendor_profile_views (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  viewer_id uuid references public.profiles(id) on delete set null,
  viewed_at timestamptz not null default now()
);

create index vendor_profile_views_vendor_idx
  on public.vendor_profile_views (vendor_id, viewed_at desc);

alter table public.vendor_profile_views enable row level security;

-- Anyone, authenticated or not, can record a view.
create policy "vendor_profile_views public insert"
  on public.vendor_profile_views for insert
  to anon, authenticated
  with check (true);

-- Only the owning vendor can read their analytics.
create policy "vendor_profile_views vendor select"
  on public.vendor_profile_views for select
  to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );
