-- handle_new_user now sets profiles.role='vendor' when the signup
-- metadata flags vendor intent (intended_role='vendor', or the
-- legacy vendor_business_name + vendor_category combo from
-- /vendor-apply). It still defaults to 'host' for everyone else and
-- never honors any other metadata value (so an attacker can't pass
-- intended_role='admin' to escalate). The "role lock" BEFORE
-- UPDATE trigger remains in place, so a user still can't change
-- their own role after signup.
--
-- This is what cross-app login gating keys on: vendor accounts get
-- role='vendor' on day 1, so the host app rejects them at the
-- credentials step, and vice versa. The listing itself
-- (vendor_profiles row) is still only born when the vendor hits
-- Create listing — the role is independent of the listing.

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
begin
  if v_intended_role = 'vendor'
     or (v_business is not null and v_category is not null) then
    v_role := 'vendor';
  end if;

  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  -- Auto-confirm email for vendor signups so they can sign in
  -- immediately. Hosts still get the standard confirmation flow.
  if v_role = 'vendor' then
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now())
     where id = new.id;
  end if;

  return new;
end;
$$;

-- Backfill: anyone who signed up with vendor metadata but ended up
-- as a 'host' (because earlier versions of the trigger always set
-- host) gets bumped to 'vendor'. We do this directly via the
-- SECURITY DEFINER context (trigger depth > 1 is the lock's check;
-- we're running as the postgres role here so the lock doesn't
-- block us).
update public.profiles p
   set role = 'vendor'
  from auth.users u
 where u.id = p.id
   and p.role = 'host'
   and (u.raw_user_meta_data->>'intended_role' = 'vendor'
        or (u.raw_user_meta_data->>'vendor_business_name' is not null
            and u.raw_user_meta_data->>'vendor_category' is not null));
