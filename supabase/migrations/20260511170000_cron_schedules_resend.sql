-- Resend-dependent scanners now have schedules. They each return
-- early with a {note: "RESEND_API_KEY not set"} body until the
-- operator wires up the Resend project secret, so the cron job is
-- a harmless no-op until then — once the key lands, emails start
-- flowing without another deploy.
--
-- Schedule layout (UTC):
--   07:00 daily      scan-daily-digests           (per-user inbox roll-up)
--   12:00 daily      scan-review-prompts          (event_date + 3d window)
--   13:00 daily      scan-vendor-onboarding-nudges (incomplete profile sweep)
--   14:00 daily      scan-reengagement            (anniversaries / milestones)
--   15:00 Mon weekly scan-vendor-weekly-digests   (Monday 8am ET-ish recap)

select cron.schedule(
  'scan-daily-digests-daily',
  '0 7 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-daily-digests',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);

select cron.schedule(
  'scan-review-prompts-daily',
  '0 12 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-review-prompts',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);

select cron.schedule(
  'scan-vendor-onboarding-nudges-daily',
  '0 13 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-vendor-onboarding-nudges',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);

select cron.schedule(
  'scan-reengagement-daily',
  '0 14 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-reengagement',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);

select cron.schedule(
  'scan-vendor-weekly-digests-weekly',
  '0 15 * * 1',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-vendor-weekly-digests',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);
