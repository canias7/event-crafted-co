-- Lock the inquiries identity columns and the "won" transition.
--
-- The current RLS update policies (host can update own, vendor can
-- update own) use USING-only clauses, so once the row passes the
-- check the user can rewrite ANY column. A malicious host could:
--   * flip status to 'won' (then post a review — the "reviews host
--     insert" policy gates on status='won')
--   * re-point host_id / vendor_id to a different account
--   * change event_type to dodge moderation buckets
--
-- A NOT-SECURITY-DEFINER BEFORE UPDATE trigger runs as the calling
-- user, so we can detect application traffic via current_user. The
-- accept_proposal_side_effects trigger is SECURITY DEFINER (owner =
-- postgres) and so its nested update has current_user='postgres'
-- which short-circuits our guard.
--
-- Admin overrides still work because is_admin() returns true and we
-- only block status changes for non-admins.

create or replace function public.tg_inquiries_update_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Internal SECURITY DEFINER paths (e.g. accept_proposal_side_effects,
  -- direct service-role calls) run as postgres — let them through.
  if current_user = 'postgres'
     or current_user = 'supabase_admin'
     or pg_has_role(current_user, 'postgres', 'MEMBER') then
    return new;
  end if;

  -- Identity columns are immutable after insert.
  if new.host_id is distinct from old.host_id then
    raise exception 'inquiries.host_id is immutable';
  end if;
  if new.vendor_id is distinct from old.vendor_id then
    raise exception 'inquiries.vendor_id is immutable';
  end if;
  if new.event_type is distinct from old.event_type then
    raise exception 'inquiries.event_type is immutable';
  end if;

  -- Hosts may not self-promote an inquiry to "won". That status gates
  -- review writes ("reviews host insert" policy) and the legitimate
  -- path is accept_proposal_side_effects, which bypasses this guard
  -- via the postgres-role check above.
  if new.status = 'won'
     and old.status is distinct from 'won'
     and auth.uid() = old.host_id then
    raise exception 'hosts cannot set inquiry status to won directly';
  end if;

  -- Once terminal, only admin can re-open. Keeps analytics honest and
  -- stops anyone from oscillating an inquiry across the won/lost line.
  if old.status in ('won','lost','expired','cancelled')
     and new.status is distinct from old.status
     and not public.is_admin() then
    raise exception 'cannot change a terminal inquiry status';
  end if;

  return new;
end;
$$;

drop trigger if exists inquiries_update_guard on public.inquiries;
create trigger inquiries_update_guard
  before update on public.inquiries
  for each row execute function public.tg_inquiries_update_guard();
