-- Email deliverability tracking. Resend (the transactional email
-- provider behind send-transactional-email) supports webhooks for
-- every lifecycle event — sent, delivered, bounced, complained,
-- opened, clicked. We persist them here so admins can see the
-- aggregate rates + spot deliverability problems early.
--
-- Operator setup (one-time): in Resend dashboard → Webhooks → add
-- endpoint pointing at <SUPABASE_URL>/functions/v1/resend-webhook
-- and select the events you care about. Send the webhook signing
-- secret to Supabase as RESEND_WEBHOOK_SECRET — the edge function
-- verifies signatures before persisting.

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  resend_event_id text unique,
  resend_email_id text,
  event_type text not null
    check (event_type in (
      'email.sent','email.delivered','email.bounced','email.complained',
      'email.opened','email.clicked','email.delivery_delayed','email.failed'
    )),
  recipient_email text,
  subject text,
  meta jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index email_events_occurred_idx
  on public.email_events (occurred_at desc);
create index email_events_type_idx
  on public.email_events (event_type, occurred_at desc);
create index email_events_recipient_idx
  on public.email_events (recipient_email, occurred_at desc);
create index email_events_email_id_idx
  on public.email_events (resend_email_id) where resend_email_id is not null;

alter table public.email_events enable row level security;

-- Admin-only read; webhook writes via service-role.
create policy "email_events admin select"
  on public.email_events for select to authenticated
  using (public.is_admin());

-- Aggregate rollup: 30-day windows + per-event-type counts so the
-- admin dashboard can render without scanning every row client-side.
create or replace function public.get_email_deliverability_summary(
  p_window_days int default 30
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_since timestamptz := now() - (p_window_days || ' days')::interval;
  v_sent int;
  v_delivered int;
  v_bounced int;
  v_complained int;
  v_failed int;
  v_opened int;
  v_clicked int;
  v_unique_recipients int;
  v_top_bounces jsonb;
  v_recent_failures jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select count(*) into v_sent
    from public.email_events
    where event_type = 'email.sent' and occurred_at >= v_since;
  select count(*) into v_delivered
    from public.email_events
    where event_type = 'email.delivered' and occurred_at >= v_since;
  select count(*) into v_bounced
    from public.email_events
    where event_type = 'email.bounced' and occurred_at >= v_since;
  select count(*) into v_complained
    from public.email_events
    where event_type = 'email.complained' and occurred_at >= v_since;
  select count(*) into v_failed
    from public.email_events
    where event_type = 'email.failed' and occurred_at >= v_since;
  select count(*) into v_opened
    from public.email_events
    where event_type = 'email.opened' and occurred_at >= v_since;
  select count(*) into v_clicked
    from public.email_events
    where event_type = 'email.clicked' and occurred_at >= v_since;
  select count(distinct recipient_email) into v_unique_recipients
    from public.email_events
    where event_type = 'email.sent' and occurred_at >= v_since;

  select coalesce(jsonb_agg(t order by t->>'count' desc), '[]'::jsonb)
    into v_top_bounces
  from (
    select jsonb_build_object(
      'recipient_email', recipient_email,
      'count', count(*),
      'last_seen', max(occurred_at)
    ) as t
    from public.email_events
    where event_type in ('email.bounced','email.complained')
      and occurred_at >= v_since
      and recipient_email is not null
    group by recipient_email
    order by count(*) desc
    limit 10
  ) sub;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'event_type', e.event_type,
    'recipient_email', e.recipient_email,
    'subject', e.subject,
    'occurred_at', e.occurred_at,
    'meta', e.meta
  ) order by e.occurred_at desc), '[]'::jsonb)
    into v_recent_failures
    from public.email_events e
    where e.event_type in ('email.bounced','email.complained','email.failed')
      and e.occurred_at >= v_since
    limit 50;

  return jsonb_build_object(
    'window_days', p_window_days,
    'sent', v_sent,
    'delivered', v_delivered,
    'bounced', v_bounced,
    'complained', v_complained,
    'failed', v_failed,
    'opened', v_opened,
    'clicked', v_clicked,
    'unique_recipients', v_unique_recipients,
    'delivery_rate', case when v_sent > 0 then round(v_delivered::numeric / v_sent, 4) else null end,
    'bounce_rate', case when v_sent > 0 then round(v_bounced::numeric / v_sent, 4) else null end,
    'complaint_rate', case when v_sent > 0 then round(v_complained::numeric / v_sent, 4) else null end,
    'open_rate', case when v_delivered > 0 then round(v_opened::numeric / v_delivered, 4) else null end,
    'top_bounces', v_top_bounces,
    'recent_failures', v_recent_failures
  );
end$$;

revoke execute on function public.get_email_deliverability_summary(int) from public, anon;
grant execute on function public.get_email_deliverability_summary(int) to authenticated;

-- Daily rollup for the line chart in the dashboard.
create or replace function public.get_email_daily_volume(
  p_window_days int default 30
)
returns table (
  day date,
  sent int,
  delivered int,
  bounced int
)
language sql stable security definer set search_path = public
as $$
  with days as (
    select generate_series(
      (current_date - (p_window_days - 1))::date,
      current_date,
      '1 day'::interval
    )::date as day
  )
  select
    d.day,
    coalesce(sum((e.event_type = 'email.sent')::int), 0)::int,
    coalesce(sum((e.event_type = 'email.delivered')::int), 0)::int,
    coalesce(sum((e.event_type = 'email.bounced')::int), 0)::int
  from days d
  left join public.email_events e
    on date_trunc('day', e.occurred_at)::date = d.day
  group by d.day
  order by d.day asc;
$$;

revoke execute on function public.get_email_daily_volume(int) from public, anon;
grant execute on function public.get_email_daily_volume(int) to authenticated;
