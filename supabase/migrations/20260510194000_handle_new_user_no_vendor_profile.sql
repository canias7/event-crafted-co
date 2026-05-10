-- Strict product rule: signing up creates an account, never a
-- listing. The vendor_profiles row is born only when the vendor
-- explicitly opens Create listing in the profile tab (the listing
-- builder auto-creates a row with status='draft' on first visit).
--
-- Previously this trigger inserted a vendor_profiles row from
-- signup metadata. That created the chicken-and-egg of "signup ==
-- already in the system as a half-baked listing." We're dropping
-- that. The trigger now ONLY creates the host profile + auto-
-- confirms the email when intended_role='vendor' so the new user
-- can sign in immediately.

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
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'host',
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  -- Vendor signups (vendor mobile signup form, web /vendor-apply,
  -- or any flow that flags intended_role='vendor' / passes business
  -- name + category) get their email auto-confirmed so they can
  -- sign in immediately. No vendor_profile is created here — the
  -- listing builder is the only path to that row.
  if v_intended_role = 'vendor'
     or (v_business is not null and v_category is not null) then
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now())
     where id = new.id;
  end if;

  return new;
end;
$$;

-- Sweep any rows that were ever auto-created from signup metadata
-- but never had real listing fields filled in. These are pure
-- "made an account" rows that should not exist as vendor_profiles
-- under the new rule. Approved rows with actual data (location +
-- bio + price) stay — those represent real published listings.
delete from public.vendor_profiles
 where (location is null
        or bio is null
        or base_price_cents is null
        or base_price_cents <= 0);
