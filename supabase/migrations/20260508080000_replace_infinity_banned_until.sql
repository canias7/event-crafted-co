-- Fix: GoTrue (Go) can't scan banned_until='infinity' into *time.Time, so
-- ANY auth.users row with banned_until=infinity broke /signup, /token,
-- /admin/users etc. with a 500 error. Replace infinity with a far-future
-- real timestamp everywhere — same effect (locks the user out for
-- ~8000 years) but actually readable by Go.

-- 1. Backfill: any existing rows with banned_until=infinity → 9999-12-31.
update auth.users
   set banned_until = '9999-12-31 00:00:00+00'::timestamptz
 where banned_until = 'infinity'::timestamptz;

-- 2. Patch handle_new_user to use the safe sentinel.
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
    update auth.users
       set banned_until = '9999-12-31 00:00:00+00'::timestamptz
     where id = new.id;
  end if;

  return new;
end;
$$;

-- 3. Patch tg_vendor_profiles_role_promote.
create or replace function public.tg_vendor_profiles_role_promote()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.application_status = 'approved'
     and (old.application_status is distinct from 'approved')
  then
    update public.profiles set role = 'vendor' where id = new.user_id;
    update auth.users set banned_until = null where id = new.user_id;
  end if;

  if old.application_status = 'approved'
     and new.application_status = 'rejected'
  then
    update auth.users
       set banned_until = '9999-12-31 00:00:00+00'::timestamptz
     where id = new.user_id;
  end if;

  return new;
end;
$$;

-- 4. Patch tg_profiles_suspend_mirror.
create or replace function public.tg_profiles_suspend_mirror()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.suspended_at is distinct from old.suspended_at then
    if new.suspended_at is not null then
      update auth.users
         set banned_until = '9999-12-31 00:00:00+00'::timestamptz
       where id = new.id;
    else
      if not exists (
        select 1 from public.vendor_profiles
        where user_id = new.id
          and application_status in ('pending','rejected')
      ) then
        update auth.users set banned_until = null where id = new.id;
      end if;
    end if;
  end if;
  return new;
end;
$$;
