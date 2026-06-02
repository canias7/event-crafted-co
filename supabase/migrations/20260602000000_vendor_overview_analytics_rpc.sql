-- Server-side aggregation for the vendor Overview cards. Replaces the
-- client-side fetch of up to 10k rows (inquiries/expenses/invoices) with a
-- single aggregated call. Scoped strictly to the caller's own data:
-- vendor_ids are derived from auth.uid()'s owned vendor_profiles, and
-- expenses by user_id = auth.uid().
create or replace function public.vendor_overview_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_vendor_ids uuid[];
  v_since30   timestamptz := now() - interval '30 days';
  v_since60   timestamptz := now() - interval '60 days';
  v_leads     jsonb;
  v_expenses  jsonb;
  v_rev30     bigint;
  v_rev60     bigint;
  v_series    jsonb;
begin
  if v_uid is null then
    return jsonb_build_object(
      'leads', jsonb_build_object('new',0,'active',0,'won',0,'lost',0,'total',0),
      'expenses', jsonb_build_object('total',0,'count',0,'categoryCount',0,'topCategories','[]'::jsonb),
      'revenue30d', 0, 'revenue30dPrev', 0,
      'revenueSeries', (select jsonb_agg(0) from generate_series(1,30))
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
    'new',    count(*) filter (where bucket='new'),
    'active', count(*) filter (where bucket='active'),
    'won',    count(*) filter (where bucket='won'),
    'lost',   count(*) filter (where bucket='lost'),
    'total',  count(*)
  ) into v_leads from lead_status;

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
  by_item as (
    select label, sum(amount_cents)::bigint as cents from exp group by label
  ),
  ranked as (
    select label, cents, row_number() over (order by cents desc) as rn from by_item
  ),
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

  -- Revenue (paid invoices) current + previous 30d windows.
  select coalesce(sum(total_cents), 0) into v_rev30 from public.invoices
   where vendor_id = any(v_vendor_ids) and status = 'paid'
     and paid_at >= v_since30 and paid_at < now();
  select coalesce(sum(total_cents), 0) into v_rev60 from public.invoices
   where vendor_id = any(v_vendor_ids) and status = 'paid'
     and paid_at >= v_since60 and paid_at < v_since30;

  -- Daily revenue series: 30 buckets, today-29 .. today.
  with days as (select generate_series(0,29) as idx),
  paid as (
    select floor(extract(epoch from (paid_at - v_since30)) / 86400)::int as day_idx, total_cents
    from public.invoices
    where vendor_id = any(v_vendor_ids) and status = 'paid'
      and paid_at >= v_since30 and paid_at < now()
  ),
  bucketed as (
    select d.idx, coalesce(sum(p.total_cents), 0)::bigint as cents
    from days d left join paid p on p.day_idx = d.idx
    group by d.idx
  )
  select jsonb_agg(cents order by idx) into v_series from bucketed;

  return jsonb_build_object(
    'leads', v_leads,
    'expenses', v_expenses,
    'revenue30d', v_rev30,
    'revenue30dPrev', v_rev60,
    'revenueSeries', coalesce(v_series, (select jsonb_agg(0) from generate_series(1,30)))
  );
end;
$$;

revoke all on function public.vendor_overview_analytics() from public, anon;
grant execute on function public.vendor_overview_analytics() to authenticated;
