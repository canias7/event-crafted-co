-- 20260506030000_drop_staffing.sql
drop index if exists public.vendor_profiles_staffing_idx;
alter table public.vendor_profiles
  drop column if exists is_staffing,
  drop column if exists hourly_rate_cents,
  drop column if exists min_hours;

-- 20260506040000_vendor_application_status.sql
alter table public.vendor_profiles
  add column if not exists application_status text not null
  default 'approved'
  check (application_status in ('pending', 'approved', 'rejected'));

alter table public.vendor_profiles
  add column if not exists application_reviewed_at timestamptz,
  add column if not exists application_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists application_review_notes text;

alter table public.vendor_profiles
  alter column application_status set default 'pending';

drop policy if exists "vendor_profiles public read" on public.vendor_profiles;

create policy "vendor_profiles public read approved"
  on public.vendor_profiles for select
  using (
    application_status = 'approved'
    or auth.uid() = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create index if not exists vendor_profiles_status_idx
  on public.vendor_profiles (application_status, created_at desc);

-- 20260506050000_vendor_category_attributes.sql
alter table public.vendor_profiles
  add column if not exists category_attributes jsonb not null default '{}'::jsonb;

create index if not exists vendor_profiles_category_attributes_idx
  on public.vendor_profiles using gin (category_attributes jsonb_path_ops);

-- 20260506060000_seed_demo_vendors.sql (schema parts only; reseed below handles data)
alter table public.vendor_profiles
  alter column user_id drop not null;

alter table public.vendor_profiles
  add column if not exists is_demo boolean not null default false;

create index if not exists vendor_profiles_demo_idx
  on public.vendor_profiles (is_demo)
  where is_demo = true;

-- 20260507100000_vendor_team_bios.sql
create table if not exists public.vendor_team_bios (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  display_name text not null,
  role text,
  bio text,
  photo_storage_path text,
  is_owner boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists vendor_team_bios_vendor_idx
  on public.vendor_team_bios (vendor_id, display_order, created_at);

alter table public.vendor_team_bios enable row level security;

drop policy if exists "vendor_team_bios public read" on public.vendor_team_bios;
create policy "vendor_team_bios public read"
  on public.vendor_team_bios for select using (true);

drop policy if exists "vendor_team_bios owner insert" on public.vendor_team_bios;
create policy "vendor_team_bios owner insert"
  on public.vendor_team_bios for insert to authenticated
  with check (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));

drop policy if exists "vendor_team_bios owner update" on public.vendor_team_bios;
create policy "vendor_team_bios owner update"
  on public.vendor_team_bios for update to authenticated
  using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));

drop policy if exists "vendor_team_bios owner delete" on public.vendor_team_bios;
create policy "vendor_team_bios owner delete"
  on public.vendor_team_bios for delete to authenticated
  using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));