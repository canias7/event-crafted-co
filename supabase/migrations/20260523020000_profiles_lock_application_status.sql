-- LAUNCH BLOCKER FIX (mirror of the vendor_profiles version from
-- 20260519190000).
--
-- public.profiles RLS lets the row owner update any column via the
-- "profiles update own" policy:
--   for update using (auth.uid() = id)
-- with no `with check` qualifier and no column restriction. The
-- `role` column is locked by tg_profiles_lock_role, but
-- `application_status` was never pinned.
--
-- Concrete exploit: an authenticated vendor signs up, confirms
-- email, signs in, then runs from the JS console:
--   supabase.from('profiles')
--     .update({ application_status: 'approved' })
--     .eq('id', userId);
-- RLS accepts the update. The useAuth gate
--   profile.role === 'vendor' && profile.application_status === 'approved'
-- evaluates true and unlocks the full vendor surface (HILUX,
-- vendor inbox, MCP token minting) without admin approval. The
-- vendor also disappears from the admin pending-queue (it filters
-- on application_status='pending').
--
-- vendor_profiles got the equivalent lock back in 20260519190000;
-- this migration ports the same trigger to profiles. service_role
-- callers (edge functions, scheduled jobs) and admin users (admin
-- panel, which runs as a logged-in admin) pass through unchanged.
-- Everyone else gets their attempted application_status silently
-- coerced — UPDATE keeps the old value, INSERT lands as 'pending'.

create or replace function public.tg_profiles_lock_application_status()
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

drop trigger if exists profiles_lock_application_status
  on public.profiles;
create trigger profiles_lock_application_status
  before insert or update on public.profiles
  for each row
  execute function public.tg_profiles_lock_application_status();
