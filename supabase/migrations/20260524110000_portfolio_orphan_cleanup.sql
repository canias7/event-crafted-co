-- Hourly cleanup of orphan storage objects in vendor-portfolios.
--
-- Why we need this: the listing wizard + edit modal upload photos
-- to storage BEFORE inserting their vendor_portfolio_images rows.
-- If the vendor closes the browser tab mid-upload, our rollback
-- path doesn't run and we're left with storage objects that don't
-- correspond to any DB row. They sit forever, taking up space and
-- (via the public storage policy) being technically retrievable
-- by URL.
--
-- Per-modal cancellation (PR #844) handles the "user clicked X"
-- case. This scan handles the "user killed the tab" /
-- "device crashed" / "lost connection" cases.

-- 1. SECURITY DEFINER function so the cleanup edge function can
--    do the diff without needing to query storage.objects (which
--    requires service_role). The 60-minute floor protects active
--    uploads — a vendor picking 100 photos won't trigger any
--    deletes because the matching row inserts land within seconds.
create or replace function public.find_portfolio_orphans(
  p_older_than_minutes int default 60
)
returns text[]
language sql
security definer
set search_path = public, storage
as $$
  select coalesce(array_agg(o.name), '{}')
  from storage.objects o
  left join public.vendor_portfolio_images vpi
    on vpi.storage_path = o.name
  where o.bucket_id = 'vendor-portfolios'
    and o.created_at < (now() - (p_older_than_minutes || ' minutes')::interval)
    and vpi.id is null;
$$;

revoke all on function public.find_portfolio_orphans(int)
  from public, anon, authenticated;
grant execute on function public.find_portfolio_orphans(int)
  to service_role;

-- 2. Hourly cron. Runs at :23 past every hour so it doesn't pile
--    on top of other crons (hilux-follow-up at :00, daily digests
--    at :00 UTC, etc). Edge function returns the deleted count
--    in the response body but pg_cron throws away response bodies,
--    so monitoring goes via Supabase logs.
select cron.schedule(
  'cleanup-portfolio-orphans-hourly',
  '23 * * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/cleanup-portfolio-orphans',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb
    );
  $$
);
