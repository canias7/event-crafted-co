-- Add a per-account application_status to gate vendor sign-ins. Host
-- accounts default to 'approved' (they can use the app immediately
-- after signup). Vendor accounts start at 'pending' until an admin
-- reviews them. This is the ACCOUNT review queue; the listing
-- review queue stays on vendor_profiles.application_status.

alter table public.profiles
  add column if not exists application_status text not null
    default 'approved'
    check (application_status in ('pending', 'approved', 'rejected'));

-- handle_new_user: hosts → 'approved', vendors → 'pending'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_intended_role text := new.raw_user_meta_data->>'intended_role';
  v_business      text := new.raw_user_meta_data->>'vendor_business_name';
  v_category      text := new.raw_user_meta_data->>'vendor_category';
  v_role          text := 'host';
  v_app_status    text := 'approved';
begin
  if v_intended_role = 'vendor'
     or (v_business is not null and v_category is not null) then
    v_role := 'vendor';
    v_app_status := 'pending';
  end if;

  insert into public.profiles (id, role, display_name, application_status)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    v_app_status
  );

  if v_role = 'vendor' then
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now())
     where id = new.id;
  end if;

  return new;
end;
$$;

-- Backfill: vendors who already have a real listing (location +
-- bio + price filled in) stay approved. Vendors without one flip
-- to pending so admin can re-review intentionally.
update public.profiles p
   set application_status = 'pending'
  from auth.users u
 where u.id = p.id
   and p.role = 'vendor'
   and not exists (
     select 1 from public.vendor_profiles vp
      where vp.user_id = p.id
        and vp.location is not null
        and vp.bio is not null
        and vp.base_price_cents is not null
        and vp.base_price_cents > 0
   );

-- Admin RPCs the new Vendor Applications page needs.
create or replace function public.admin_list_vendor_applications(
  p_status text
)
returns table (
  id uuid,
  display_name text,
  application_status text,
  email text,
  business_name text,
  category text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    p.id,
    p.display_name,
    p.application_status,
    u.email,
    u.raw_user_meta_data->>'vendor_business_name' as business_name,
    u.raw_user_meta_data->>'vendor_category' as category
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'vendor'
    and p.application_status = p_status
    and public.is_admin()
  order by u.created_at desc;
$$;

revoke all on function public.admin_list_vendor_applications(text) from public;
grant execute on function public.admin_list_vendor_applications(text) to authenticated;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
