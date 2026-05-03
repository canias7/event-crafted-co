-- Vendor availability: vendors block individual dates as unavailable.
-- Public read so the directory and inquiry form can later filter by date;
-- vendor-owner-only writes.

create table public.vendor_unavailable_dates (
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  date date not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (vendor_id, date)
);

create index vendor_unavailable_dates_vendor_idx
  on public.vendor_unavailable_dates (vendor_id, date);

alter table public.vendor_unavailable_dates enable row level security;

create policy "vendor_unavailable_dates public read"
  on public.vendor_unavailable_dates for select
  using (true);

create policy "vendor_unavailable_dates owner insert"
  on public.vendor_unavailable_dates for insert
  to authenticated
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create policy "vendor_unavailable_dates owner delete"
  on public.vendor_unavailable_dates for delete
  to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create policy "vendor_unavailable_dates owner update"
  on public.vendor_unavailable_dates for update
  to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );
