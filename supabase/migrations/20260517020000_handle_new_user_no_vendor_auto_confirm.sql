-- Restore the vendor-must-be-approved gate.
--
-- A previous "one-role-per-email" migration added an
--   update auth.users set email_confirmed_at = coalesce(...)
-- inside handle_new_user that bypassed admin approval entirely —
-- new vendors could sign in immediately instead of waiting for
-- review. This restores the original intent: vendors stay
-- email_confirmed_at = null until admin approves their application,
-- at which point tg_vendor_profiles_role_promote flips the timestamp.
--
-- Host signups are unchanged (Supabase confirmation-link flow).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
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

  insert into public.profiles (id, role, display_name, application_status, onboarded_at)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    v_app_status,
    -- Hosts get onboarded_at stamped immediately; vendors don't, so
    -- their later vendor_profiles INSERT isn't blocked by the
    -- one-role-per-email trigger.
    case when v_is_vendor then null else now() end
  );

  -- NOTE: no auth.users.email_confirmed_at touch here. Vendor approval
  -- is admin-gated via tg_vendor_profiles_role_promote.

  return new;
end;
$function$;
