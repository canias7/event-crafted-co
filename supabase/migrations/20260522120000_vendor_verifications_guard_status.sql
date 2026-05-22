-- Security fix (S2): a vendor could approve their own verification.
-- The `vendor_verifications vendor update` / `vendor upsert` RLS
-- policies only check row ownership, not which columns change, so a
-- vendor could set status='approved' on their own row (or insert one
-- already approved) and self-award the Identity / Insurance /
-- Business License / Background badges that surface publicly via
-- vendor_public_badges and lift search ranking.
--
-- Fix: a BEFORE INSERT/UPDATE trigger that, for non-admin callers,
-- pins the review-controlled fields (status, reviewed_by,
-- reviewed_at) to safe values. Vendors can still submit and
-- re-submit documents; only an admin can move a verification to
-- approved/rejected. Column-level grants can't express this because
-- admins and vendors share the `authenticated` role — the trigger
-- distinguishes them via is_admin().

create or replace function public.tg_vendor_verifications_guard_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Admins (the review team) may set anything.
  if public.is_admin() then
    return new;
  end if;
  -- Non-admin = the vendor. Pin the review-controlled fields so a
  -- vendor can never approve itself.
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  else
    new.status := old.status;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end
$$;

drop trigger if exists vendor_verifications_guard_status
  on public.vendor_verifications;

create trigger vendor_verifications_guard_status
  before insert or update on public.vendor_verifications
  for each row
  execute function public.tg_vendor_verifications_guard_status();
