-- Vendor Overview for any date range (owner's call, Oct 2026): the
-- Overview's date picker (today, this week, this month, last 30/90 days,
-- this year, last 12 months or custom dates) and its "group by day /
-- week / month" switch read from this instead of the fixed 30-day
-- vendor_overview_analytics (kept unchanged for anything still calling it).
--
-- p_from / p_to are calendar days in the vendor's time zone (p_tz, an
-- IANA name from the browser; anything unknown falls back to UTC), both
-- included. Returns the leads pipeline and expenses for the range,
-- revenue for the range and for the same-length range just before it,
-- and a series of { start, cents } buckets. Weeks start on Monday.
-- Revenue = invoices paid through Vendora + payments recorded outside it
-- (vendor_revenue_events).

create or replace function public.vendor_overview_range(
  p_from date,
  p_to date,
  p_bucket text default 'day',
  p_tz text default 'UTC'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_vendor_ids uuid[];
  v_tz text := 'UTC';
  v_days int;
  v_prev_from date;
  v_leads jsonb;
  v_expenses jsonb;
  v_rev bigint;
  v_rev_prev bigint;
  v_series jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'bad_range';
  end if;
  v_days := p_to - p_from + 1;
  if v_days > 1100 then
    raise exception 'range_too_long';
  end if;
  if p_bucket not in ('day', 'week', 'month') then
    raise exception 'bad_bucket';
  end if;
  if p_bucket = 'day' and v_days > 400 then
    raise exception 'too_many_buckets';
  end if;
  if p_tz is not null and exists (select 1 from pg_timezone_names where name = p_tz) then
    v_tz := p_tz;
  end if;
  v_prev_from := p_from - v_days;

  if v_uid is null then
    return jsonb_build_object(
      'leads', jsonb_build_object('new',0,'active',0,'won',0,'lost',0,'total',0),
      'expenses', jsonb_build_object('total',0,'count',0,'categoryCount',0,'topCategories','[]'::jsonb),
      'revenue', 0,
      'revenuePrev', 0,
      'series', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(id), '{}') into v_vendor_ids
  from public.vendor_profiles where user_id = v_uid;

  -- Leads pipeline in the range, collapsed per lead (vendor_id + host_id)
  -- with the Inquiries page's priority: won > active > new > lost.
  with lead_status as (
    select case
      when bool_or(status = 'won') then 'won'
      when bool_or(status in ('replied','drafted')) then 'active'
      when bool_or(status = 'new') then 'new'
      else 'lost'
    end as bucket
    from public.inquiries
    where vendor_id = any(v_vendor_ids)
      and (created_at at time zone v_tz)::date between p_from and p_to
    group by vendor_id, host_id
  )
  select jsonb_build_object(
    'new', count(*) filter (where bucket='new'),
    'active', count(*) filter (where bucket='active'),
    'won', count(*) filter (where bucket='won'),
    'lost', count(*) filter (where bucket='lost'),
    'total', count(*)
  ) into v_leads
  from lead_status;

  -- Expenses in the range grouped by line-item label, top 3 + Other.
  with exp as (
    select coalesce(
             nullif(btrim(coalesce(item_name, '')), ''),
             nullif(btrim(coalesce(description, '')), ''),
             '—'
           ) as label,
           amount_cents
    from public.vendor_expenses
    where user_id = v_uid and occurred_on between p_from and p_to
  ),
  by_item as (select label, sum(amount_cents)::bigint as cents from exp group by label),
  ranked as (select label, cents, row_number() over (order by cents desc) as rn from by_item),
  cats as (
    select label, cents from ranked where rn <= 3
    union all
    select 'Other', sum(cents)::bigint from ranked where rn > 3 having sum(cents) > 0
  )
  select jsonb_build_object(
    'total', coalesce((select sum(amount_cents) from exp), 0),
    'count', (select count(*) from exp),
    'categoryCount', (select count(*) from by_item),
    'topCategories', coalesce(
      (select jsonb_agg(jsonb_build_object('label', label, 'cents', cents) order by cents desc) from cats),
      '[]'::jsonb)
  ) into v_expenses;

  -- Revenue in the range and in the range just before it.
  with ev as (
    select (m.at at time zone v_tz)::date as d, m.cents
    from public.vendor_revenue_events(v_uid, v_vendor_ids, (v_prev_from::timestamp at time zone v_tz)) m
  )
  select
    coalesce(sum(cents) filter (where d between p_from and p_to), 0),
    coalesce(sum(cents) filter (where d between v_prev_from and p_from - 1), 0)
  into v_rev, v_rev_prev
  from ev;

  -- Buckets from the start of p_from's day/week/month to p_to.
  with b as (
    select gs::date as start
    from generate_series(
      date_trunc(p_bucket, p_from::timestamp),
      p_to::timestamp,
      ('1 ' || p_bucket)::interval
    ) gs
  ),
  ev as (
    select date_trunc(p_bucket, (m.at at time zone v_tz))::date as start, m.cents
    from public.vendor_revenue_events(v_uid, v_vendor_ids, (p_from::timestamp at time zone v_tz)) m
    where (m.at at time zone v_tz)::date between p_from and p_to
  ),
  agg as (
    select b.start, coalesce(sum(ev.cents), 0)::bigint as cents
    from b left join ev on ev.start = b.start
    group by b.start
  )
  select jsonb_agg(jsonb_build_object('start', start, 'cents', cents) order by start)
  into v_series from agg;

  return jsonb_build_object(
    'leads', v_leads,
    'expenses', v_expenses,
    'revenue', v_rev,
    'revenuePrev', v_rev_prev,
    'series', coalesce(v_series, '[]'::jsonb)
  );
end;
$function$;

revoke execute on function public.vendor_overview_range(date, date, text, text) from public, anon;
grant execute on function public.vendor_overview_range(date, date, text, text) to authenticated;
