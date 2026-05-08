-- BUG 1: tg_vendor_profiles_role_promote re-banned the vendor on
-- approved -> pending, but a vendor's OWN re-publish flips status
-- from approved to pending. Only ban on explicit rejection.

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

  -- Only ban on explicit admin rejection. A vendor re-publishing
  -- their own listing flips approved -> pending and must NOT lock
  -- them out of their dashboard.
  if old.application_status = 'approved'
     and new.application_status = 'rejected'
  then
    update auth.users
       set banned_until = 'infinity'::timestamptz
     where id = new.user_id;
  end if;

  return new;
end;
$$;

-- BUG 2: profiles.suspended_at was advisory only — admin clicked
-- "Revoke access" but the user could still sign in. Mirror it to
-- auth.users.banned_until so suspending actually blocks sign-in.

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
         set banned_until = 'infinity'::timestamptz
       where id = new.id;
    else
      -- Unsuspend lifts the ban — but only if the vendor is approved.
      -- If they're a pending vendor, the role-promote trigger owns
      -- that ban; don't clear it from here.
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

drop trigger if exists profiles_suspend_mirror on public.profiles;
create trigger profiles_suspend_mirror
  after update of suspended_at on public.profiles
  for each row execute function public.tg_profiles_suspend_mirror();
