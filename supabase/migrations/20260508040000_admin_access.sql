-- Admin app support: columns the admin UI mutates, RLS that lets admins
-- act across users' rows, and a role-lock trigger update so admins can
-- change other people's roles from the admin client.

-- 1. New columns the admin UI writes to.
alter table public.vendor_profiles
  add column if not exists application_status text not null default 'approved'
    check (application_status in ('pending','approved','rejected'));
alter table public.vendor_profiles
  add column if not exists application_reviewed_at timestamptz;
alter table public.vendor_profiles
  add column if not exists application_reviewed_by uuid
    references public.profiles(id) on delete set null;

create index if not exists vendor_profiles_application_status_idx
  on public.vendor_profiles (application_status, created_at desc);

alter table public.reviews
  add column if not exists is_hidden boolean not null default false;

alter table public.profiles
  add column if not exists suspended_at timestamptz;

-- 2. Helper: am I an admin? Stable + security definer so it can read
-- profiles without recursing through RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 3. Admin-wide RLS policies. Postgres ORs multiple policies, so these
-- are additive: end users keep their existing scoped access.
drop policy if exists "profiles admin all" on public.profiles;
create policy "profiles admin all" on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "vendor_profiles admin all" on public.vendor_profiles;
create policy "vendor_profiles admin all" on public.vendor_profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "reviews admin all" on public.reviews;
create policy "reviews admin all" on public.reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "vendor_verifications admin all" on public.vendor_verifications;
create policy "vendor_verifications admin all" on public.vendor_verifications
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 4. Allow admins to change anyone's role. The lock-role trigger from
-- 20260508030000 reverted ALL non-trigger, non-service-role attempts;
-- this widens the allow-list to also include calls coming from an
-- admin-role JWT.
create or replace function public.tg_profiles_lock_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if pg_trigger_depth() <= 1
       and coalesce(auth.role(), '') <> 'service_role'
       and not public.is_admin()
    then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

-- 5. Convenience view for public surfaces that want to skip moderated
-- reviews without re-writing every existing policy. Hidden rows stay
-- visible to admins (via the policy above) and to the row's host
-- (existing user-scoped policies); only the public/anon read paths
-- should switch to this view.
create or replace view public.reviews_public as
  select * from public.reviews where is_hidden = false;

grant select on public.reviews_public to anon, authenticated;
