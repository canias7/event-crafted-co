-- Cross-vendor benchmarks. Lets a vendor see how they compare to other
-- vendors in the same category — median reply time, booking rate, and
-- weekly inquiries. Critical for retention: vendors stay engaged when
-- they have something to chase ("you're slower than your peers").
--
-- Authorization: SECURITY DEFINER + the caller must own a vendor_profile
-- in the requested category (otherwise anyone could fish for category
-- stats). Returns aggregates only — never identifies peer vendors.

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
  select exists (
    select 1 from public.vendor_profiles
    where user_id = auth.uid() and category = p_category
  ) into v_caller_owns;
  if not v_caller_owns then
    raise exception 'Only vendors in this category can view its benchmarks';
  end if;

  -- Per-vendor numbers, then take the median across vendors.
  return query
  with per_vendor as (
    select
      vp.id as vendor_id,
      -- Inquiries in window
      (
        select count(*) from public.inquiries i
        where i.vendor_id = vp.id and i.created_at >= v_since
      ) as inquiries,
      -- Booking rate = won / (won + lost + expired) in window. Skip
      -- still-pending so a vendor with 5 new + 0 closed doesn't read
      -- as 0%.
      (
        select case
          when count(*) filter (where status in ('won','lost','expired')) = 0 then null
          else round(
            count(*) filter (where status = 'won')::numeric
            / count(*) filter (where status in ('won','lost','expired')),
            3
          )
        end
        from public.inquiries i
        where i.vendor_id = vp.id and i.created_at >= v_since
      ) as booking_rate,
      -- Median response time (in hours) per vendor: per-inquiry first
      -- vendor reply minus inquiry created. Outer median across vendors.
      (
        select percentile_cont(0.5) within group (order by ext.delta_hr)
        from (
          select extract(epoch from (
            (select min(m.created_at)
               from public.messages m
               where m.inquiry_id = i.id and m.sender_role = 'vendor')
            - i.created_at
          )) / 3600.0 as delta_hr
          from public.inquiries i
          where i.vendor_id = vp.id
            and i.created_at >= v_since
            and exists (
              select 1 from public.messages m
              where m.inquiry_id = i.id and m.sender_role = 'vendor'
            )
        ) ext
        where ext.delta_hr is not null and ext.delta_hr >= 0
      ) as response_hours
    from public.vendor_profiles vp
    where vp.category = p_category
  )
  select
    (select count(*)::int from per_vendor) as peer_count,
    percentile_cont(0.5) within group (order by response_hours)::numeric(10,2) as median_response_hours,
    percentile_cont(0.5) within group (order by booking_rate)::numeric(5,3) as median_booking_rate,
    percentile_cont(0.5) within group (order by inquiries)::int as median_inquiries
  from per_vendor;
end$$;

revoke execute on function public.get_vendor_benchmarks(text, int) from public, anon;
grant execute on function public.get_vendor_benchmarks(text, int) to authenticated;
