-- Daily cron sweep for the HILUX auto-archive-cold action.
-- 17:00 UTC = 1pm ET / 10am PT. Runs after vendors have had
-- their morning, before they hit the inbox at lunch.

select cron.schedule(
  'hilux-archive-cold-daily',
  '0 17 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/hilux-archive-cold',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb
    );
  $$
);
