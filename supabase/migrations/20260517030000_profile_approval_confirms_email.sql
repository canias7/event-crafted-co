-- The admin panel approves a vendor by flipping
-- profiles.application_status to 'approved' (see
-- apps/admin/src/pages/VendorApplicationsPage.tsx setStatus).
-- The existing tg_vendor_profiles_role_promote fires only on
-- vendor_profiles changes — and a brand-new vendor doesn't have a
-- vendor_profiles row until they create their first listing. So
-- admin approval was leaving email_confirmed_at = null, blocking
-- the vendor at signin-2fa with "Your application is still under
-- review."
--
-- This trigger parallels tg_vendor_profiles_role_promote but on
-- profiles.application_status. Either path now confirms the email
-- when the application is approved.

create or replace function public.tg_profiles_role_promote()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $function$
begin
  if new.application_status = 'approved'
     and (old.application_status is distinct from 'approved')
     and new.role = 'vendor'
  then
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now())
     where id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_role_promote on public.profiles;
create trigger profiles_role_promote
after update of application_status on public.profiles
for each row
execute function public.tg_profiles_role_promote();
