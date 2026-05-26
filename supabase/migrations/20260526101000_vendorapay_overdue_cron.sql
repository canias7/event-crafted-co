-- Daily cron: nudge buyers about overdue invoices. Calls
-- scan-vendorapay-overdue which finds invoices that crossed
-- due_date without payment + are either un-nudged or last
-- nudged > 7 days ago.
--
-- 14:00 UTC = ~10:00 ET / 09:00 CT / 07:00 PT — into the US
-- workday so the email lands while a buyer might actually
-- pay it from their desk, but after vendors have had their
-- morning coffee in case anything looks off.

select cron.schedule(
  'scan-vendorapay-overdue-daily',
  '0 14 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-vendorapay-overdue',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
)
where not exists (
  select 1 from cron.job where jobname = 'scan-vendorapay-overdue-daily'
);
