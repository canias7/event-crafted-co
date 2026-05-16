-- Hosts shouldn't have to click an email link to finish signing up.
-- They sign up, they're in. (Vendors still go through admin approval
-- — they stay email_confirmed_at = null until the approval trigger
-- flips it.)
--
-- Setting email_confirmed_at inside the trigger fires before GoTrue
-- checks whether to send a confirm-link email, so the link email is
-- skipped entirely AND the client gets a live session immediately
-- (signUp returns data.session != null). Same trick the mobile
-- vendor/host-signup edge functions use via admin.createUser
-- email_confirm:true.

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
    case when v_is_vendor then null else now() end
  );

  -- Auto-confirm hosts so signup → instant access. Vendors stay
  -- unconfirmed until tg_profiles_role_promote (or
  -- tg_vendor_profiles_role_promote) sets email_confirmed_at on
  -- admin approval.
  if not v_is_vendor then
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now())
     where id = new.id;
  end if;

  return new;
end;
$function$;
