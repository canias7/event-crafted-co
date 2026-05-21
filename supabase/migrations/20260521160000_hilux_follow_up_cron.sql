-- HILUX follow-up: daily nudge sweep.
-- Picks threads where the latest message is a vendor-side message
-- 2–4 days old and the host hasn't responded. Sends one nudge per
-- qualifying thread; cooldown lives inside the function.

select cron.schedule(
  'hilux-follow-up-daily',
  -- 16:00 UTC = 12pm ET / 9am PT — vendors are likely opening their
  -- inbox by then, so nudges land alongside their morning catch-up.
  '0 16 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/hilux-follow-up',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);
