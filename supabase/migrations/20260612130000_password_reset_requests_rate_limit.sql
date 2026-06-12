-- Per-email rate-limit state for the password-reset edge function.
-- We moved password reset off supabase.auth.resetPasswordForEmail (which
-- the project's bot/abuse captcha blocks on native) to a service-role
-- edge function that mints a recovery link via admin.generateLink. That
-- path bypasses GoTrue's built-in email rate limit, so we re-implement a
-- two-tier per-email limit here (60s floor + 5/hour), mirroring
-- host_signup_codes. Only the service role (RLS-exempt) touches this.
create table if not exists public.password_reset_requests (
  email text primary key,
  requested_at timestamptz not null default now(),
  request_count_window integer not null default 1,
  request_window_started_at timestamptz not null default now()
);

alter table public.password_reset_requests enable row level security;
-- No policies on purpose: anon/authenticated get no access; the edge
-- function uses the service role, which bypasses RLS.
