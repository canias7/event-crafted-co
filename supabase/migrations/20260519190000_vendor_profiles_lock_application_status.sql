-- LAUNCH BLOCKER FIX
--
-- vendor_profiles RLS only checked auth.uid() = user_id, with no
-- column restriction on application_status. A vendor could insert
-- (or update) their own row with application_status = 'approved'
-- via the JS console — RLS accepts it and the existing
-- tg_vendor_profiles_role_promote trigger then auto-confirms the
-- user's email in auth.users. End result: self-approval bypassing
-- both admin moderation AND email verification in one INSERT.
--
-- This BEFORE INSERT/UPDATE trigger pins the column so client
-- callers can never set it. Admins + service-role callers (the
-- moderation flow + edge functions) pass through unchanged.

create or replace function public.tg_vendor_profiles_lock_application_status()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  -- service_role (edge functions, scheduled jobs) and admin users
  -- can set application_status freely. Everyone else gets their
  -- attempted value silently coerced — same UX as before, RLS
  -- doesn't have to error to keep moderation honest.
  if coalesce((select auth.role()), '') = 'service_role' or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.application_status := 'pending';
  elsif tg_op = 'UPDATE' then
    new.application_status := old.application_status;
  end if;
  return new;
end
$$;

drop trigger if exists vendor_profiles_lock_application_status
  on public.vendor_profiles;
create trigger vendor_profiles_lock_application_status
  before insert or update on public.vendor_profiles
  for each row
  execute function public.tg_vendor_profiles_lock_application_status();
