-- Daily cron: scan vendor_recurring_expenses for due rows and
-- insert vendor_expenses rows from each rule template. 07:00 UTC
-- (~2am ET) so the row appears in the vendor's books before they
-- open the dashboard.

select cron.schedule(
  'scan-vendor-recurring-expenses-daily',
  '0 7 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-vendor-recurring-expenses',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
) where not exists (
  select 1 from cron.job where jobname = 'scan-vendor-recurring-expenses-daily'
);
