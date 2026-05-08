-- New vendor signups need admin approval; flip the default.
alter table public.vendor_profiles
  alter column application_status set default 'pending';

-- Admins need to see emails (in auth.users) and audit users.
-- Wrap in a security-definer RPC so authenticated users can call it,
-- but the body itself enforces the admin gate.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  display_name text,
  role text,
  suspended_at timestamptz,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select
      p.id,
      u.email::text,
      p.display_name,
      p.role::text,
      p.suspended_at,
      u.created_at,
      u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by u.created_at desc
    limit 500;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

-- Public listing pages should NOT show pending or rejected vendors.
-- Update the public-facing read policies to filter by approved.
-- (Existing 'select own' and 'admin all' policies stay as-is — vendor
-- can see their own pending profile, admin sees everything.)
drop policy if exists "vendor_profiles public read" on public.vendor_profiles;
create policy "vendor_profiles public read" on public.vendor_profiles
  for select to anon, authenticated
  using (application_status = 'approved');
