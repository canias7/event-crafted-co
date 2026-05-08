-- 1. Extend handle_new_user to also create the vendor_profile if the
-- signup carried vendor metadata. This keeps the apply flow working
-- even when email confirmation is on (no client session yet, so the
-- client can't INSERT into vendor_profiles itself).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to public, auth
as $$
declare
  v_business text := new.raw_user_meta_data->>'vendor_business_name';
  v_category text := new.raw_user_meta_data->>'vendor_category';
begin
  insert into public.profiles (id, role, display_name)
  values (new.id, 'host',
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  if v_business is not null and v_category is not null then
    insert into public.vendor_profiles (user_id, business_name, category, application_status)
    values (new.id, v_business, v_category, 'pending');
  end if;

  return new;
end;
$$;

-- 2. When an admin approves a vendor_profile, promote the user's
-- profiles.role to 'vendor' so they can access the vendor dashboard.
-- Rejection or pending leaves the role alone.
create or replace function public.tg_vendor_profiles_role_promote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.application_status = 'approved'
     and (old.application_status is distinct from 'approved')
  then
    update public.profiles set role = 'vendor' where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_profiles_role_promote on public.vendor_profiles;
create trigger vendor_profiles_role_promote
  after update of application_status on public.vendor_profiles
  for each row execute function public.tg_vendor_profiles_role_promote();
