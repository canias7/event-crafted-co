-- Admin deliverability view: latest status per email (rolls up the multiple
-- events Resend fires per message — sent → delivered / bounced / complained).
-- Mirrors the other admin_* RPCs: SECURITY DEFINER, gated on is_admin().
create or replace function public.admin_recent_email_events(
  p_limit int default 200,
  p_since timestamptz default (now() - interval '7 days')
)
returns table(
  resend_email_id text,
  recipient_email text,
  subject text,
  latest_status text,
  last_event_at timestamptz,
  event_count bigint
)
language sql stable security definer set search_path to 'public'
as $function$
  with admin_ok as (
    select case when public.is_admin() then 1 else null end as ok
  ),
  ev as (
    select e.resend_email_id, e.recipient_email, e.subject, e.event_type, e.occurred_at
    from public.email_events e, admin_ok
    where admin_ok.ok is not null
      and e.occurred_at >= p_since
      and e.resend_email_id is not null
  ),
  ranked as (
    select *,
      row_number() over (partition by resend_email_id order by occurred_at desc) as rn,
      count(*) over (partition by resend_email_id) as cnt
    from ev
  )
  select resend_email_id, recipient_email, subject,
         event_type as latest_status, occurred_at as last_event_at, cnt as event_count
  from ranked
  where rn = 1
  order by last_event_at desc
  limit greatest(1, least(p_limit, 500));
$function$;

grant execute on function public.admin_recent_email_events(int, timestamptz) to authenticated;
