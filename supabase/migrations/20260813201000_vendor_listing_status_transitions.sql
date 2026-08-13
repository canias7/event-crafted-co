-- Rewrite tg_vendor_profiles_lock_application_status to match the real
-- product flow. The old version coerced EVERY vendor insert to
-- 'pending' (blank listings born into the review queue — the reported
-- bug) and froze application_status on every vendor update (Publish on
-- a real draft and Unpublish were silent no-ops).
--
-- New rules (service_role and admins remain unrestricted):
--   INSERT: vendors' listings are born 'draft', always.
--   UPDATE: vendors may submit for review (draft/rejected -> pending)
--           and withdraw/unpublish (anything -> draft). Everything
--           else (self-approval etc.) is coerced back, silently, as
--           before.
--
-- Depth guards stay layered on top:
--   - trg_require_photos_for_review demotes review entry with <3
--     photos back to draft (runs before this trigger: t < v).
--   - trg_enforce_listing_min_photos still blocks approval outright
--     below 3 photos.
create or replace function public.tg_vendor_profiles_lock_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role (edge functions, scheduled jobs) and admin users
  -- can set application_status freely.
  if coalesce((select auth.role()), '') = 'service_role' or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.application_status := 'draft';
  elsif tg_op = 'UPDATE' then
    if new.application_status is not distinct from old.application_status then
      return new;
    end if;
    -- Submit for review.
    if old.application_status in ('draft', 'rejected')
       and new.application_status = 'pending' then
      return new;
    end if;
    -- Withdraw from review / unpublish.
    if new.application_status = 'draft' then
      return new;
    end if;
    -- Anything else (self-approval etc.): silently keep the old value,
    -- same moderation-honest UX as before.
    new.application_status := old.application_status;
  end if;
  return new;
end;
$$;

-- Re-run the sweep from the previous migration: it was a no-op then
-- because the old lock trigger froze application_status for the
-- migration role too. pending -> draft is now an allowed transition.
update public.vendor_profiles vp
   set application_status = 'draft'
 where vp.application_status in ('pending', 'submitted')
   and (select count(*) from public.vendor_portfolio_images i
         where i.vendor_id = vp.id) < 3;
