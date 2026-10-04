-- Restore EXECUTE on helper SECURITY DEFINER functions used by RLS policies.
grant execute on function public.is_vendor_owner(uuid) to authenticated;
grant execute on function public.can_access_inquiry(uuid) to authenticated;

-- Host event planning fields on profiles.
alter table public.profiles
  add column if not exists event_type text check (event_type in ('wedding','birthday','holiday_dinner','other')),
  add column if not exists event_date date,
  add column if not exists event_location text,
  add column if not exists budget_min_cents integer,
  add column if not exists budget_max_cents integer,
  add column if not exists event_notes text,
  add column if not exists onboarded_at timestamptz;

-- Vendor profiles public read
drop policy if exists "vendor_profiles select authed" on public.vendor_profiles;
drop policy if exists "vendor_profiles public read" on public.vendor_profiles;
create policy "vendor_profiles public read" on public.vendor_profiles for select using (true);

-- Realtime publication
do $pub$ begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end $pub$;
do $pub$ begin alter publication supabase_realtime add table public.inquiries; exception when duplicate_object then null; end $pub$;

-- saved_vendors
create table if not exists public.saved_vendors (
  host_id uuid not null references public.profiles(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (host_id, vendor_id)
);
create index if not exists saved_vendors_host_idx on public.saved_vendors (host_id, created_at desc);
alter table public.saved_vendors enable row level security;
drop policy if exists "saved_vendors host select" on public.saved_vendors;
create policy "saved_vendors host select" on public.saved_vendors for select using (auth.uid() = host_id);
drop policy if exists "saved_vendors host insert" on public.saved_vendors;
create policy "saved_vendors host insert" on public.saved_vendors for insert with check (auth.uid() = host_id);
drop policy if exists "saved_vendors host delete" on public.saved_vendors;
create policy "saved_vendors host delete" on public.saved_vendors for delete using (auth.uid() = host_id);
