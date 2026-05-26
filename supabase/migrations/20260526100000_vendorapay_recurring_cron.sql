-- Daily cron: emit any vendor_recurring_invoices rows whose
-- next_run_at has elapsed. Uses pg_net.http_post (no auth header
-- — the scan function is deployed with verify_jwt=false and only
-- operates on due rows, so it's safe to leave unauthenticated;
-- same pattern as scan-vendorapay-payment-schedules).
--
-- 09:00 UTC is the conservative time slot — before US East Coast
-- workdays start so vendors see today's invoices when they open
-- their email.

select cron.schedule(
  'scan-vendorapay-recurring-daily',
  '0 9 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-vendorapay-recurring',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
)
where not exists (
  select 1 from cron.job where jobname = 'scan-vendorapay-recurring-daily'
);
