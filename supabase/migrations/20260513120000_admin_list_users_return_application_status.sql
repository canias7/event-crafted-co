-- Surface profile.application_status from admin_list_users so the
-- admin Users tab can show "Vendor (pending)" / "Vendor (rejected)"
-- without having to join through vendor_profiles client-side.
--
-- Background: the auto-vendor-profile-on-signup trigger was dropped
-- (PR #159). Vendors no longer have a vendor_profiles row at signup,
-- and the UsersPage was keying display_role off the vendor_profiles
-- status map. Empty map → falls through to "Host" — so freshly signed
-- up vendors were appearing as hosts in the admin tab.
--
-- Adding application_status to this RPC + reading it client-side
-- removes the dependency on vendor_profiles entirely.

drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
returns table(
  id uuid,
  email text,
  display_name text,
  role text,
  application_status text,
  suspended_at timestamptz,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
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
      p.application_status::text,
      p.suspended_at,
      u.created_at,
      u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by u.created_at desc
    limit 500;
end;
$$;
