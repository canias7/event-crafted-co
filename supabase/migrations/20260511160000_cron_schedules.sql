-- Wire pg_cron so the background scanners actually run. Up until now
-- there were ZERO cron jobs configured, which meant:
--   * inquiries never auto-expired (status='expired' was dead code)
--   * responder_tier never recomputed (vendors stuck on their first tier)
--   * saved-search matches never delivered
--   * notifications grew unbounded
--
-- All scan-* functions are deployed with verify_jwt=false, so pg_net
-- can hit them without a bearer token. pg_net is async and swallows
-- failures, so a temporarily-down edge function doesn't backpressure
-- the scheduler.
--
-- Schedules are staggered so a single bad query window doesn't block
-- everything. Times in UTC.

-- Hour 03 Sunday UTC — DB-local cleanup, no external call.
select cron.schedule(
  'prune-notifications-weekly',
  '0 3 * * 0',
  $$ select public.prune_notifications(); $$
);

-- Hour 04 UTC daily — expire stale inquiries (14d default).
select cron.schedule(
  'scan-expired-inquiries-daily',
  '0 4 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-expired-inquiries',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);

-- Hour 05 UTC daily — recompute vendor responder_tier rankings.
select cron.schedule(
  'scan-responder-tiers-daily',
  '0 5 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-responder-tiers',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);

-- Hour 06 UTC daily — saved-search → in-app + opt-in email fanout.
select cron.schedule(
  'scan-saved-search-matches-daily',
  '0 6 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-saved-search-matches',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);
