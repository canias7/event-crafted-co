-- Repoint handle_new_user's email auto-confirm from HOSTS to VENDORS, to
-- enable HOST-only email confirmation.
--
-- Before: the trigger force-confirmed hosts' emails, leaving vendors to the
-- global setting. That meant turning on Supabase's global "Confirm email"
-- would have made VENDORS verify (their email has no confirm link → locked
-- out) while HOSTS still skipped it — the opposite of what we want.
--
-- After: the trigger force-confirms VENDORS (their gate is admin approval,
-- not email) and leaves HOSTS unconfirmed. So with the global "Confirm
-- email" setting ON:
--   * Host signs up  -> must verify via the "Confirm your Vendora account" email
--   * Vendor signs up -> auto-confirmed here, gets the informational
--                        "Thanks for applying" email + /check-email review page,
--                        and can sign in once approved (email already confirmed)
--
-- Inert while the global setting is OFF: both groups stay auto-confirmed by
-- the global auto-confirm exactly as before. Only NEW signups are affected;
-- existing users keep their confirmed state.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $function$
declare
  v_intended_role text := new.raw_user_meta_data->>'intended_role';
  v_business      text := new.raw_user_meta_data->>'vendor_business_name';
  v_category      text := new.raw_user_meta_data->>'vendor_category';
  v_role          text := 'host';
  v_app_status    text := 'approved';
  v_is_vendor     boolean := false;
begin
  if v_intended_role = 'vendor'
     or (v_business is not null and v_category is not null) then
    v_role := 'vendor';
    v_app_status := 'pending';
    v_is_vendor := true;
  end if;

  insert into public.profiles (
    id, role, display_name, business_name, application_status, onboarded_at
  )
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    case when v_is_vendor then nullif(trim(coalesce(v_business, '')), '') else null end,
    v_app_status,
    case when v_is_vendor then null else now() end
  );

  -- Vendors skip email verification (admin approval is their gate); hosts
  -- do NOT, so when global "Confirm email" is on they must verify by email.
  if v_is_vendor then
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now())
     where id = new.id;
  end if;

  return new;
end;
$function$;
