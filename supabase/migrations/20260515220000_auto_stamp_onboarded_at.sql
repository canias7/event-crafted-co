-- Mobile has no separate onboarding step — signup → explore. Web is
-- being mirrored, so OnboardingPage was deleted. This migration:
--   1. Updates handle_new_user to stamp onboarded_at on insert, so
--      every newly-created profile is immediately a fully-onboarded
--      host (vendors who want host-side access get it for free).
--   2. Backfills existing profiles that still have null onboarded_at
--      — no surviving UI to stamp it, so they'd be locked out of
--      /customer/* if we didn't.

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
begin
  if v_intended_role = 'vendor'
     or (v_business is not null and v_category is not null) then
    v_role := 'vendor';
    v_app_status := 'pending';
  end if;

  insert into public.profiles (id, role, display_name, application_status, onboarded_at)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    v_app_status,
    now()
  );

  if v_role = 'vendor' then
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now())
     where id = new.id;
  end if;

  return new;
end;
$function$;

update public.profiles set onboarded_at = now() where onboarded_at is null;
