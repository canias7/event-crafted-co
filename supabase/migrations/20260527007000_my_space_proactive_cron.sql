-- My Space proactive nudges: once a day at 14:00 UTC (= 9am ET / 6am
-- PT). Notifies vendors with stale new inquiries and uncontacted hot
-- leads. 20h dedup inside the worker keeps it from spamming on
-- accidental re-runs.

select cron.schedule(
  'my-space-proactive',
  '0 14 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/my-space-proactive',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);
