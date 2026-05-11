-- Notification pruning. Every server-side trigger that fires an in-app
-- alert (notify_message, notify_inquiry_status, notify_proposal_*,
-- review prompt, content_report dispatch, etc.) inserts a row into
-- public.notifications. None of them ever clean up, so the table grows
-- unbounded — eventually slowing the inbox query and bloating the DB.
--
-- prune_notifications() trims two long tails:
--   1) read notifications older than 30 days  (the user already saw them)
--   2) any notification older than 180 days   (stale even if unread)
--
-- The function is SECURITY DEFINER + locked down to service_role so a
-- daily pg_cron job (or the existing scan-* edge function machinery)
-- can call it without RLS getting in the way. It returns the number of
-- rows deleted so the caller can log it.

create or replace function public.prune_notifications()
returns table (
  deleted_read     bigint,
  deleted_stale    bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_read  bigint := 0;
  v_deleted_stale bigint := 0;
begin
  with d as (
    delete from public.notifications
     where read_at is not null
       and read_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into v_deleted_read from d;

  with d as (
    delete from public.notifications
     where created_at < now() - interval '180 days'
    returning 1
  )
  select count(*) into v_deleted_stale from d;

  return query select v_deleted_read, v_deleted_stale;
end;
$$;

revoke execute on function public.prune_notifications() from public, anon, authenticated;
grant  execute on function public.prune_notifications() to service_role;
