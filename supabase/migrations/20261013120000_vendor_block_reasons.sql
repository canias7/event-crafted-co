-- Blocked-date titles are private to the vendor (step 1 of 2).
--
-- vendor_unavailable_dates is publicly readable so the directory, the
-- inquiry form and vendor pages can tell which days are taken. That
-- also exposed the vendor's private title ("reason") to anyone who
-- queried the table directly. The vendor screens now read their titles
-- through this function, which only returns rows for vendors the caller
-- is a team member of.
--
-- Step 2 (a later migration, once the vendor app update has reached
-- phones) revokes public SELECT on the reason column itself.

create or replace function public.get_vendor_block_reasons(
  p_vendor_ids uuid[],
  p_start date,
  p_end date
)
returns table (vendor_id uuid, date date, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select d.vendor_id, d.date, d.reason
  from public.vendor_unavailable_dates d
  where d.vendor_id = any(p_vendor_ids)
    and public.is_vendor_member(d.vendor_id)
    and d.date >= p_start
    and d.date < p_end
$$;

revoke execute on function public.get_vendor_block_reasons(uuid[], date, date)
  from public, anon;
grant execute on function public.get_vendor_block_reasons(uuid[], date, date)
  to authenticated;
