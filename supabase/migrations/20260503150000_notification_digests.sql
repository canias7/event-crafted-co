-- Daily digest emails: bundle each user's unread notifications from the
-- last 24h into one email. Triggered by a cron-scheduled edge function
-- (scan-daily-digests) that calls enqueue_pending_digests() once a day.

-- Per-notification flag so we don't re-send if the cron runs twice.
alter table public.notifications
  add column if not exists digested_at timestamptz;

create index if not exists notifications_pending_digest_idx
  on public.notifications (user_id, created_at)
  where digested_at is null and read_at is null;

-- Per-user opt-out. Defaults to enabled; off via /settings (UI to come).
alter table public.profiles
  add column if not exists daily_digest_enabled boolean not null default true;

-- Atomically marks notifications as digested + returns one row per user
-- with their notifications jsonb-aggregated. The edge function loops
-- and emails one user at a time. Skips users with daily_digest_enabled=false.
create or replace function public.enqueue_pending_digests(
  p_lookback_hours int default 24
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  notifications jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  -- Pick up every unread + un-digested notification within the window for
  -- users who haven't opted out. Same statement marks them digested.
  with eligible as (
    update public.notifications n
    set digested_at = now()
    from public.profiles p
    where n.user_id = p.id
      and p.daily_digest_enabled = true
      and n.digested_at is null
      and n.read_at is null
      and n.created_at >= (now() - make_interval(hours => p_lookback_hours))
    returning n.id, n.user_id
  )
  select array_agg(id) into v_ids from eligible;

  if v_ids is null or array_length(v_ids, 1) = 0 then
    return;
  end if;

  return query
  select
    p.id,
    u.email,
    p.display_name,
    p.role,
    jsonb_agg(
      jsonb_build_object(
        'type', n.type,
        'title', n.title,
        'body', n.body,
        'link', n.link,
        'created_at', n.created_at
      ) order by n.created_at desc
    ) as notifications
  from public.notifications n
  join public.profiles p on p.id = n.user_id
  left join auth.users u on u.id = p.id
  where n.id = any(v_ids)
  group by p.id, u.email, p.display_name, p.role;
end$$;

grant execute on function public.enqueue_pending_digests(int) to service_role;
