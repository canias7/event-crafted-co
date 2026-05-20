-- Server-side aggregation for vendor + host review stats. Pages
-- currently fetch ALL reviews and reduce client-side to compute
-- the average rating, which doesn't scale past a few hundred
-- reviews (each row also pulls joined profile/response/inquiry
-- data). With these functions the page can fetch a limited
-- detail-view of recent reviews AND get count+avg in a single
-- cheap call.

create or replace function public.get_vendor_review_stats(p_vendor_id uuid)
returns table (count bigint, avg numeric)
language sql
stable
security invoker
set search_path to 'public'
as $$
  -- Match the same filter the VendorDetailPage uses to build the
  -- aggregate card: host's event reviews against this vendor.
  select count(*)::bigint, coalesce(avg(rating), 0)::numeric
    from public.reviews
   where vendor_id = p_vendor_id
     and rater_role = 'host'
     and kind = 'event';
$$;

create or replace function public.get_host_review_stats(p_host_id uuid)
returns table (count bigint, avg numeric)
language sql
stable
security invoker
set search_path to 'public'
as $$
  -- Counterpart for the host profile: vendor's event reviews
  -- against this host.
  select count(*)::bigint, coalesce(avg(rating), 0)::numeric
    from public.reviews
   where host_id = p_host_id
     and rater_role = 'vendor'
     and kind = 'event';
$$;

grant execute on function public.get_vendor_review_stats(uuid) to anon, authenticated;
grant execute on function public.get_host_review_stats(uuid) to anon, authenticated;
