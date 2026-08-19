-- Meet the Team: optional team-member profiles on the vendor BRAND
-- (account-level, keyed by user_id like the gallery) shown on the
-- public vendor pages when profiles.show_team is on.

create table if not exists public.vendor_team_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  role_title text not null,
  bio text,
  specialty text,
  years_with_business text,
  fun_fact text,
  link_url text,
  photo_url text,
  display_order integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists vendor_team_profiles_user_idx
  on public.vendor_team_profiles (user_id, display_order);

alter table public.vendor_team_profiles enable row level security;

-- Owner: full CRUD on their own team.
drop policy if exists "team_owner_all" on public.vendor_team_profiles;
create policy "team_owner_all" on public.vendor_team_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Everyone (incl. anon public pages): read visible members only.
drop policy if exists "team_public_read" on public.vendor_team_profiles;
create policy "team_public_read" on public.vendor_team_profiles
  for select using (visible = true);

-- Account-level "show Meet the Team on my profile" toggle.
alter table public.profiles
  add column if not exists show_team boolean not null default true;

-- profiles has no anon SELECT, so the public team-read policy must
-- check show_team itself (security definer sidesteps profiles RLS).
create or replace function public.team_is_public(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select show_team from public.profiles where id = p_user_id),
    true
  );
$$;

drop policy if exists "team_public_read" on public.vendor_team_profiles;
create policy "team_public_read" on public.vendor_team_profiles
  for select using (visible = true and public.team_is_public(user_id));
