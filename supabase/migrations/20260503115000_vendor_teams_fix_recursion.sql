-- Fix infinite-recursion in vendor_team_members policies. The previous
-- migration's SELECT and DELETE policies queried the same table inside
-- the USING clause without a SECURITY DEFINER helper — Postgres re-applies
-- RLS to that inner query, which triggers the same policy, which queries
-- again, etc.
--
-- Solution: wrap the membership lookups in SECURITY DEFINER helpers that
-- bypass RLS. is_vendor_member already exists; add is_vendor_team_admin
-- for owner/admin checks.

create or replace function public.is_vendor_team_admin(_vendor_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.vendor_team_members m
    where m.vendor_id = _vendor_id
      and m.user_id = auth.uid()
      and m.role in ('owner','admin')
  )
$$;

grant execute on function public.is_vendor_team_admin(uuid) to authenticated;

drop policy if exists "vendor_team_members select own teammates" on public.vendor_team_members;
drop policy if exists "vendor_team_members manage by owner/admin" on public.vendor_team_members;

create policy "vendor_team_members select teammates"
  on public.vendor_team_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_vendor_member(vendor_id)
  );

create policy "vendor_team_members admin delete"
  on public.vendor_team_members for delete
  to authenticated
  using (
    public.is_vendor_team_admin(vendor_id)
    and role <> 'owner'
  );

-- vendor_team_invites had the same issue — its policies referenced
-- vendor_team_members directly without going through a helper.
drop policy if exists "vendor_team_invites manage by owner/admin" on public.vendor_team_invites;
drop policy if exists "vendor_team_invites insert by owner/admin" on public.vendor_team_invites;
drop policy if exists "vendor_team_invites delete by owner/admin" on public.vendor_team_invites;

create policy "vendor_team_invites admin select"
  on public.vendor_team_invites for select
  to authenticated
  using (public.is_vendor_team_admin(vendor_id));

create policy "vendor_team_invites admin insert"
  on public.vendor_team_invites for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and public.is_vendor_team_admin(vendor_id)
  );

create policy "vendor_team_invites admin delete"
  on public.vendor_team_invites for delete
  to authenticated
  using (public.is_vendor_team_admin(vendor_id));

-- Same recursion issue in the vendor_profiles team-admin update policy.
drop policy if exists "vendor_profiles team admin update" on public.vendor_profiles;
create policy "vendor_profiles team admin update"
  on public.vendor_profiles for update to authenticated
  using (public.is_vendor_team_admin(id));

-- Allow reading teammates' profiles so the Team page can show display names.
-- Without this, the existing "profiles select own" policy means everyone but
-- you would render as "Teammate".
create or replace function public.shares_vendor_team(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.vendor_team_members me
    join public.vendor_team_members them on them.vendor_id = me.vendor_id
    where me.user_id = auth.uid()
      and them.user_id = _user_id
  )
$$;

grant execute on function public.shares_vendor_team(uuid) to authenticated;

create policy "profiles select teammates"
  on public.profiles for select
  to authenticated
  using (public.shares_vendor_team(id));
