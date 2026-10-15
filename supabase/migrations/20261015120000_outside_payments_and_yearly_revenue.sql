-- Payments received outside Vendora + a 12-month revenue view (owner's
-- call, Oct 2026).
--
-- Until now the Overview's revenue only counted invoices paid through
-- Vendora (Stripe). Vendors can now record money they were paid some
-- other way (cash, Zelle, check, Venmo, a bank transfer, a card reader of
-- their own) so the chart and the cash-flow card reflect their real
-- business. Rows are account-level, like expenses: one per payment,
-- owned by the vendor who recorded it, never shown to hosts.
--
-- vendor_overview_analytics keeps every key it returned before (with
-- recorded payments now included in the revenue numbers) and adds a
-- 12-month view: revenue12m, revenue12mPrev (the 12 months before) and
-- revenueMonthly (12 buckets, oldest month first, the current month last).

create table if not exists public.vendor_outside_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  received_on date not null default current_date,
  method text not null check (method in ('cash', 'zelle', 'check', 'venmo', 'bank_transfer', 'card', 'other')),
  client_name text check (client_name is null or char_length(client_name) <= 120),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists vendor_outside_payments_user_date_idx
  on public.vendor_outside_payments (user_id, received_on desc);

alter table public.vendor_outside_payments enable row level security;

drop policy if exists vendor_outside_payments_own on public.vendor_outside_payments;
create policy vendor_outside_payments_own on public.vendor_outside_payments
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.vendor_outside_payments from anon;
grant select, insert, update, delete on public.vendor_outside_payments to authenticated;

-- Every payment a vendor received since p_since, one row each: invoices
-- paid through Vendora (at paid_at) and payments they recorded themselves
-- (at noon UTC of received_on). Internal: only vendor_overview_analytics
-- calls it, so nobody else may execute it.
create or replace function public.vendor_revenue_events(p_uid uuid, p_vendor_ids uuid[], p_since timestamptz)
returns table(at timestamptz, cents bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select i.paid_at, i.total_cents::bigint
  from public.invoices i
  where i.vendor_id = any(p_vendor_ids) and i.status = 'paid'
    and i.paid_at >= p_since and i.paid_at < now()
  union all
  select (o.received_on::timestamp + interval '12 hours') at time zone 'UTC', o.amount_cents
  from public.vendor_outside_payments o
  where o.user_id = p_uid
    and o.received_on >= (p_since at time zone 'UTC')::date
    and o.received_on <= current_date;
$function$;

revoke execute on function public.vendor_revenue_events(uuid, uuid[], timestamptz) from public, anon, authenticated;

create or replace function public.vendor_overview_analytics()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_vendor_ids uuid[];
  v_since30 timestamptz := now() - interval '30 days';
  v_since60 timestamptz := now() - interval '60 days';
  v_month0 date := (date_trunc('month', now()) - interval '11 months')::date;
  v_month_prev0 date := (date_trunc('month', now()) - interval '23 months')::date;
  v_leads jsonb;
  v_expenses jsonb;
  v_rev30 bigint;
  v_rev60 bigint;
  v_series jsonb;
  v_rev12 bigint;
  v_rev12prev bigint;
  v_monthly jsonb;
begin
  if v_uid is null then
    return jsonb_build_object(
      'leads', jsonb_build_object('new',0,'active',0,'won',0,'lost',0,'total',0),
      'expenses', jsonb_build_object('total',0,'count',0,'categoryCount',0,'topCategories','[]'::jsonb),
      'revenue30d', 0,
      'revenue30dPrev', 0,
      'revenueSeries', (select jsonb_agg(0) from generate_series(1,30)),
      'revenue12m', 0,
      'revenue12mPrev', 0,
      'revenueMonthly', (select jsonb_agg(0) from generate_series(1,12))
    );
  end if;

  select coalesce(array_agg(id), '{}') into v_vendor_ids
  from public.vendor_profiles where user_id = v_uid;

  -- Leads pipeline (last 30d) collapsed per lead (vendor_id + host_id),
  -- using the same status priority as the Inquiries page:
  -- won > active(replied/drafted) > new > lost.
  with lead_status as (
    select case
      when bool_or(status = 'won') then 'won'
      when bool_or(status in ('replied','drafted')) then 'active'
      when bool_or(status = 'new') then 'new'
      else 'lost'
    end as bucket
    from public.inquiries
    where vendor_id = any(v_vendor_ids) and created_at >= v_since30
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

  -- Operating expenses (last 30d) grouped by line-item label, top 3 + Other.
  with exp as (
    select coalesce(
             nullif(btrim(coalesce(item_name, '')), ''),
             nullif(btrim(coalesce(description, '')), ''),
             '—'
           ) as label,
           amount_cents
    from public.vendor_expenses
    where user_id = v_uid and occurred_on >= v_since30::date
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

  -- Revenue: invoices paid through Vendora plus payments the vendor
  -- recorded themselves. Current + previous 30 days, last 12 calendar
  -- months (this month included) + the 12 before.
  select
    coalesce(sum(m.cents) filter (where m.at >= v_since30), 0),
    coalesce(sum(m.cents) filter (where m.at >= v_since60 and m.at < v_since30), 0),
    coalesce(sum(m.cents) filter (where m.at >= v_month0), 0),
    coalesce(sum(m.cents) filter (where m.at < v_month0), 0)
  into v_rev30, v_rev60, v_rev12, v_rev12prev
  from public.vendor_revenue_events(v_uid, v_vendor_ids, v_month_prev0) m;

  -- Daily series: 30 buckets, today-29 .. today.
  with days as (select generate_series(0,29) as idx),
  paid as (
    select least(29, floor(extract(epoch from (m.at - v_since30)) / 86400)::int) as day_idx, m.cents
    from public.vendor_revenue_events(v_uid, v_vendor_ids, v_since30) m
    where m.at >= v_since30
  ),
  bucketed as (
    select d.idx, coalesce(sum(p.cents), 0)::bigint as cents
    from days d left join paid p on p.day_idx = d.idx
    group by d.idx
  )
  select jsonb_agg(cents order by idx) into v_series from bucketed;

  -- Monthly series: 12 buckets, oldest month first.
  with months as (select generate_series(0,11) as idx),
  paid as (
    select ((extract(year from m.at)::int * 12 + extract(month from m.at)::int)
            - (extract(year from v_month0)::int * 12 + extract(month from v_month0)::int)) as m_idx,
           m.cents
    from public.vendor_revenue_events(v_uid, v_vendor_ids, v_month0) m
  ),
  bucketed as (
    select mo.idx, coalesce(sum(p.cents), 0)::bigint as cents
    from months mo left join paid p on p.m_idx = mo.idx
    group by mo.idx
  )
  select jsonb_agg(cents order by idx) into v_monthly from bucketed;

  return jsonb_build_object(
    'leads', v_leads,
    'expenses', v_expenses,
    'revenue30d', v_rev30,
    'revenue30dPrev', v_rev60,
    'revenueSeries', coalesce(v_series, (select jsonb_agg(0) from generate_series(1,30))),
    'revenue12m', v_rev12,
    'revenue12mPrev', v_rev12prev,
    'revenueMonthly', coalesce(v_monthly, (select jsonb_agg(0) from generate_series(1,12)))
  );
end;
$function$;
