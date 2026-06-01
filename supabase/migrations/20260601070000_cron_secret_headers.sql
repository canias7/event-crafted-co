-- Add a dormant shared-secret header to the cron jobs that invoke the
-- verify_jwt=false edge functions flagged in M1/M2. Each net.http_post
-- call now sends an 'x-cron-secret' header sourced from the Vault secret
-- named 'cron_secret', coalesced to an empty string when that secret
-- does not exist yet.
--
-- This migration is SAFE to apply immediately:
--   * If the Vault secret 'cron_secret' is absent, the header is sent
--     as an empty string.
--   * The edge functions only ENFORCE the secret once their own
--     CRON_SECRET env var is set (and non-empty). Until the operator
--     sets BOTH the Vault secret and the matching function env var, the
--     check is skipped and every cron tick keeps working unchanged.
--
-- Only the jobs targeting the seven flagged functions are re-issued.
-- Schedules and bodies are preserved exactly; the sole change is the
-- added header. Jobs for other functions are untouched.
--
-- Re-issuing cron.schedule() with an existing job name updates that
-- job in place (pg_cron upsert semantics), so no unschedule is needed.

-- my-space-action-worker — every 5 minutes (throttled in 20260601040000).
select cron.schedule(
  'my-space-action-worker',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/my-space-action-worker',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), '')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- my-space-proactive — daily 14:00 UTC.
select cron.schedule(
  'my-space-proactive',
  '0 14 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/my-space-proactive',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), '')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- scan-vendor-onboarding-nudges — daily 13:00 UTC.
select cron.schedule(
  'scan-vendor-onboarding-nudges-daily',
  '0 13 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-vendor-onboarding-nudges',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), '')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- scan-vendor-recurring-expenses — daily 07:00 UTC.
select cron.schedule(
  'scan-vendor-recurring-expenses-daily',
  '0 7 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-vendor-recurring-expenses',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), '')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- scan-vendor-weekly-digests — weekly Monday 15:00 UTC.
select cron.schedule(
  'scan-vendor-weekly-digests-weekly',
  '0 15 * * 1',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-vendor-weekly-digests',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), '')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- scan-vendorapay-overdue — daily 14:00 UTC.
select cron.schedule(
  'scan-vendorapay-overdue-daily',
  '0 14 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-vendorapay-overdue',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), '')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- scan-vendorapay-payment-schedules — daily 08:00 UTC.
select cron.schedule(
  'scan-vendorapay-payment-schedules-daily',
  '0 8 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/scan-vendorapay-payment-schedules',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), '')
      ),
      body := '{}'::jsonb
    );
  $$
);
