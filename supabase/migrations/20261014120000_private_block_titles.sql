-- Blocked-date titles are private to the vendor's team (step 2).
-- The table stays readable so hosts can see which days are taken, but
-- anon and authenticated lose the reason column; the vendor's team reads
-- titles through get_vendor_block_reasons (security definer).
-- Writes keep working: the apps insert with ON CONFLICT DO NOTHING, then
-- UPDATE the title (an ON CONFLICT DO UPDATE would need SELECT on reason).
revoke select on public.vendor_unavailable_dates from anon, authenticated;
grant select (vendor_id, date, created_at) on public.vendor_unavailable_dates to anon, authenticated;
