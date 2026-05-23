-- Per-email request rate-limit for the vendor- and host-signup
-- 6-digit-code flow.
--
-- Previously the /request action on both functions was uncapped:
--   * No rate limit -> attacker bombs Resend with victim's email
--   * /request upsert reset `attempts` to 0 -> bypassed the 5-per-code
--     /verify attempt cap by rotating codes
--   * Combined with /verify's createUser fallback (separate fix in
--     the same PR), this opened ATO of any unconfirmed account
--
-- This adds three columns the edge function uses for two-tier limits:
--   requested_at: when the most recent code was issued. The edge
--     function enforces a 60s floor between requests (anti-spam).
--   request_count_window: number of /request hits in the current
--     1-hour window. Capped at 5 per window (anti-brute-force).
--   request_window_started_at: start of the current 1-hour window.
--     Reset by the edge function on rollover.
--
-- The 5 calls/hour cap, combined with the existing 5 attempts per
-- code, bounds an attacker to 25 guesses/hour against a 10^6 keyspace
-- -- ~years of grinding per email for a 50% chance.

alter table public.vendor_signup_codes
  add column if not exists requested_at timestamptz,
  add column if not exists request_count_window integer not null default 0,
  add column if not exists request_window_started_at timestamptz;

alter table public.host_signup_codes
  add column if not exists requested_at timestamptz,
  add column if not exists request_count_window integer not null default 0,
  add column if not exists request_window_started_at timestamptz;
