-- Block sign-in for vendors awaiting admin approval. GoTrue rejects
-- sign-in if auth.users.banned_until is in the future, so set it far
-- out at signup and clear it on admin approval.

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
    -- Block sign-in until an admin approves. Far-future timestamp.
    update auth.users
       set banned_until = 'infinity'::timestamptz
     where id = new.id;
  end if;

  return new;
end;
$$;

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
    -- Lift the sign-in ban now that the vendor is approved.
    update auth.users set banned_until = null where id = new.user_id;
  end if;

  -- If admin reverses the decision (approved → rejected/pending),
  -- re-ban the user so they lose access immediately.
  if old.application_status = 'approved'
     and new.application_status is distinct from 'approved'
  then
    update auth.users
       set banned_until = 'infinity'::timestamptz
     where id = new.user_id;
  end if;

  return new;
end;
$$;

-- Backfill: ban any existing user with a pending vendor_profile.
update auth.users u
   set banned_until = 'infinity'::timestamptz
  from public.vendor_profiles vp
 where vp.user_id = u.id
   and vp.application_status = 'pending'
   and (u.banned_until is null or u.banned_until < now());
