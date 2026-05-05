-- Budget benchmarks: percentile bands aggregated from active vendor
-- packages by category. Hosts use this on the budget page to see what
-- "typical" spend looks like in their area. Knot's killer feature on
-- their planning side; we already have all the data, this just
-- surfaces it.
--
-- Returns null if there isn't enough data (<5 packages) — better to
-- show nothing than misleading numbers from a sparse city.
--
-- Location matching: free-text contains, case-insensitive. The
-- `p_location` param can be a city name, state abbreviation, or
-- empty (in which case we benchmark nationally for the category).
--
-- SECURITY DEFINER so callers don't need RLS read on vendor_packages
-- (which they have anyway via "vendor_packages public read", but
-- locking it server-side keeps the API tight).

create or replace function public.get_budget_benchmarks(
  p_category text,
  p_location text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  sample_count integer;
begin
  -- Map host-side budget category labels to vendor category labels
  -- via a small alias table. Lets the budget page use "Photography"
  -- while vendor profiles say "Photographer". Add new aliases here
  -- as the taxonomies drift.
  with category_aliases as (
    select unnest(case lower(p_category)
      when 'photography' then array['photographer','photography']
      when 'videography' then array['videographer','videography']
      when 'florals' then array['florist','florals','floral designer']
      when 'catering' then array['catering','caterer']
      when 'music & entertainment' then array['dj','musician','band','music & entertainment','entertainment']
      when 'cake & bakery' then array['baker','bakery','cake & bakery','pastry']
      when 'decorations' then array['decorator','decor','event designer','decorations']
      when 'beauty' then array['makeup artist','hair stylist','beauty']
      when 'venue' then array['venue']
      when 'invitations' then array['stationer','calligrapher','invitations']
      when 'transportation' then array['transportation','car service','limo']
      when 'av / equipment' then array['av','equipment rental','av / equipment']
      else array[lower(p_category)]
    end) as alias
  ),
  matched_packages as (
    select pkg.price_cents
    from public.vendor_packages pkg
    join public.vendor_profiles vp on vp.id = pkg.vendor_id
    where pkg.is_active
      and pkg.price_cents > 0
      and lower(vp.category) in (select alias from category_aliases)
      and (
        p_location is null
        or p_location = ''
        or vp.location ilike '%' || p_location || '%'
      )
  )
  select
    count(*),
    jsonb_build_object(
      'category', p_category,
      'location', p_location,
      'sample_size', count(*),
      'p25_cents', percentile_cont(0.25) within group (order by price_cents)::int,
      'p50_cents', percentile_cont(0.50) within group (order by price_cents)::int,
      'p75_cents', percentile_cont(0.75) within group (order by price_cents)::int,
      'p90_cents', percentile_cont(0.90) within group (order by price_cents)::int,
      'min_cents', min(price_cents),
      'max_cents', max(price_cents)
    )
  into sample_count, result
  from matched_packages;

  if sample_count is null or sample_count < 5 then
    -- Not enough data to publish a meaningful benchmark.
    return null;
  end if;

  return result;
end;
$$;

grant execute on function public.get_budget_benchmarks(text, text)
  to anon, authenticated;
