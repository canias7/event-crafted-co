-- Cross-sell vendor recommendations driven by co-booking signal. Two
-- public RPCs:
--
--   get_cobooked_vendors(vendor_id, limit) — vendors that appear on the
--     same host's `won` inquiries as the input vendor. Surfaces "often
--     booked with" rail on the vendor detail page.
--
--   get_recommended_for_host(host_id, limit) — for a host who's booked
--     at least one vendor, returns the top vendors that other hosts
--     who booked the same vendor(s) also booked. Classic
--     collaborative-filtering shape (people who booked this also
--     booked …) but scoped to one host's history.
--
-- Both RPCs combine the co-booking signal with vendor-curated
-- vendor_recommendations rows: a curated rec is treated as one extra
-- co-book point, so vendors can hand-promote their preferred partners.
--
-- Returns minimal fields for VendorCard rendering — no joins to
-- packages or reviews; the frontend already has those via useVendors.

create or replace function public.get_cobooked_vendors(
  p_vendor_id uuid,
  p_limit int default 6
)
returns table (
  vendor_id uuid,
  business_name text,
  category text,
  location text,
  cobookings int,
  is_curated boolean
)
language sql stable security definer set search_path = public
as $$
  with same_host_wins as (
    -- All hosts who booked the input vendor.
    select distinct host_id
    from public.inquiries
    where vendor_id = p_vendor_id and status = 'won'
  ),
  cobooks as (
    -- Other vendors those same hosts booked.
    select i.vendor_id, count(*)::int as n
    from public.inquiries i
    join same_host_wins s on s.host_id = i.host_id
    where i.status = 'won'
      and i.vendor_id <> p_vendor_id
    group by i.vendor_id
  ),
  curated as (
    select recommended_id as vendor_id
    from public.vendor_recommendations
    where recommender_id = p_vendor_id
  ),
  combined as (
    select
      vp.id as vendor_id,
      vp.business_name,
      vp.category,
      vp.location,
      coalesce(c.n, 0) as cobookings,
      (cu.vendor_id is not null) as is_curated,
      coalesce(c.n, 0) + (case when cu.vendor_id is not null then 1 else 0 end) as score
    from public.vendor_profiles vp
    left join cobooks c on c.vendor_id = vp.id
    left join curated cu on cu.vendor_id = vp.id
    where vp.id <> p_vendor_id
      and (c.n is not null or cu.vendor_id is not null)
  )
  select vendor_id, business_name, category, location, cobookings, is_curated
  from combined
  order by score desc, business_name asc
  limit p_limit;
$$;

revoke execute on function public.get_cobooked_vendors(uuid, int) from public;
grant execute on function public.get_cobooked_vendors(uuid, int) to anon, authenticated;

-- For a host: vendors that other hosts booked alongside the vendors
-- THIS host has already booked, ranked by frequency. Excludes anyone
-- this host has already inquired (won OR otherwise) so we don't
-- recommend dead-end repeats.
create or replace function public.get_recommended_for_host(
  p_host_id uuid,
  p_limit int default 6
)
returns table (
  vendor_id uuid,
  business_name text,
  category text,
  location text,
  cobookings int
)
language sql stable security definer set search_path = public
as $$
  with my_wins as (
    select distinct vendor_id
    from public.inquiries
    where host_id = p_host_id and status = 'won'
  ),
  peer_hosts as (
    -- Other hosts who also booked any of MY vendors.
    select distinct i.host_id
    from public.inquiries i
    join my_wins m on m.vendor_id = i.vendor_id
    where i.status = 'won' and i.host_id <> p_host_id
  ),
  peer_books as (
    -- All vendors those peer hosts have booked.
    select i.vendor_id, count(*)::int as n
    from public.inquiries i
    join peer_hosts p on p.host_id = i.host_id
    where i.status = 'won'
    group by i.vendor_id
  ),
  exclude as (
    -- Don't recommend vendors I've already engaged with.
    select distinct vendor_id from public.inquiries where host_id = p_host_id
  )
  select vp.id, vp.business_name, vp.category, vp.location, pb.n
  from peer_books pb
  join public.vendor_profiles vp on vp.id = pb.vendor_id
  where pb.vendor_id not in (select vendor_id from exclude)
  order by pb.n desc, vp.business_name asc
  limit p_limit;
$$;

revoke execute on function public.get_recommended_for_host(uuid, int) from public;
grant execute on function public.get_recommended_for_host(uuid, int) to authenticated;
