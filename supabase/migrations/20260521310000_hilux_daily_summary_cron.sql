-- HILUX daily summary cron. Fires the hilux-daily-summary edge
-- function once a day. The function itself loops over every profile
-- with hilux_action_daily_summary = true and emails a 24h digest.
--
-- 16:00 UTC = 9am PT / 12pm ET. Matches the follow-up timing so
-- vendors see HILUX work alongside their morning catch-up.

select cron.schedule(
  'hilux-daily-summary',
  '0 16 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/hilux-daily-summary',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);
