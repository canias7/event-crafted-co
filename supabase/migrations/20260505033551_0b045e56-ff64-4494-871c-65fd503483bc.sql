create or replace function public.get_vendor_benchmarks(
  p_category text,
  p_window_days int default 30
)
returns table (
  peer_count int,
  median_response_hours numeric,
  median_booking_rate numeric,
  median_inquiries int
)
language plpgsql security definer set search_path = public
as $$
declare
  v_caller_owns boolean;
  v_since timestamptz := now() - (p_window_days || ' days')::interval;
begin
  select exists (select 1 from public.vendor_profiles where user_id = auth.uid() and category = p_category)
    into v_caller_owns;
  if not v_caller_owns then raise exception 'Only vendors in this category can view its benchmarks'; end if;

  return query
  with per_vendor as (
    select vp.id as vendor_id,
      (select count(*) from public.inquiries i where i.vendor_id = vp.id and i.created_at >= v_since) as inquiries,
      (select case
          when count(*) filter (where status in ('won','lost','expired')) = 0 then null
          else round(count(*) filter (where status='won')::numeric / count(*) filter (where status in ('won','lost','expired')), 3)
        end from public.inquiries i where i.vendor_id = vp.id and i.created_at >= v_since) as booking_rate,
      (select percentile_cont(0.5) within group (order by ext.delta_hr)
        from (select extract(epoch from ((select min(m.created_at) from public.messages m where m.inquiry_id = i.id and m.sender_role='vendor') - i.created_at))/3600.0 as delta_hr
              from public.inquiries i
              where i.vendor_id = vp.id and i.created_at >= v_since
                and exists (select 1 from public.messages m where m.inquiry_id = i.id and m.sender_role='vendor')
        ) ext where ext.delta_hr is not null and ext.delta_hr >= 0) as response_hours
    from public.vendor_profiles vp where vp.category = p_category
  )
  select (select count(*)::int from per_vendor),
    percentile_cont(0.5) within group (order by response_hours)::numeric(10,2),
    percentile_cont(0.5) within group (order by booking_rate)::numeric(5,3),
    percentile_cont(0.5) within group (order by inquiries)::int
  from per_vendor;
end$$;

revoke execute on function public.get_vendor_benchmarks(text, int) from public, anon;
grant execute on function public.get_vendor_benchmarks(text, int) to authenticated;