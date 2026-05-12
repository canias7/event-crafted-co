-- Push deliverability tracking. Mirrors the email_events / Resend
-- webhook flow we already have for email - but for the Expo Push API
-- and Web Push (VAPID).
--
-- send-push writes a row per token it attempts to push to:
--   status='sent'           - Expo ticket OK (no permanent error)
--   status='failed'         - transient (network, retryable)
--   status='invalid_token'  - DeviceNotRegistered / InvalidCredentials
--                             (token will be purged from
--                             device_push_tokens after this insert)
--   status='rate_limited'   - Expo or VAPID 429
--   status='unknown'        - unparseable response
--
-- device_push_tokens uses the token text as its primary key, so we
-- store the token (truncated) rather than a FK.

create table if not exists public.push_events (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete set null,
  user_id         uuid not null,
  token_preview   text not null,
  token_kind      text not null check (token_kind in ('expo','web')),
  status          text not null check (status in ('sent','failed','invalid_token','rate_limited','unknown')),
  expo_ticket_id  text,
  error           text,
  created_at      timestamptz not null default now()
);

create index if not exists push_events_user_idx
  on public.push_events (user_id, created_at desc);
create index if not exists push_events_notif_idx
  on public.push_events (notification_id)
  where notification_id is not null;
create index if not exists push_events_status_idx
  on public.push_events (status, created_at desc);

alter table public.push_events enable row level security;

drop policy if exists "push_events admin read" on public.push_events;
create policy "push_events admin read"
  on public.push_events for select to authenticated
  using ((select public.is_admin()));

-- Admin dashboard summary: per-day counts + success rate over a
-- window.
create or replace function public.get_push_deliverability_summary(
  p_window_days integer default 7
)
returns table (
  day            date,
  sent           bigint,
  failed         bigint,
  invalid_token  bigint,
  rate_limited   bigint,
  total          bigint,
  success_rate   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_trunc('day', created_at)::date as day,
    count(*) filter (where status = 'sent')          as sent,
    count(*) filter (where status = 'failed')        as failed,
    count(*) filter (where status = 'invalid_token') as invalid_token,
    count(*) filter (where status = 'rate_limited')  as rate_limited,
    count(*)                                          as total,
    round(
      100.0 * count(*) filter (where status = 'sent') / nullif(count(*), 0),
      1
    ) as success_rate
  from public.push_events
  where created_at >= now() - make_interval(days => greatest(p_window_days, 1))
    and public.is_admin()
  group by 1
  order by 1 desc;
$$;

-- Admin-only RPC.
revoke execute on function public.get_push_deliverability_summary(integer)
  from public, anon, authenticated;
