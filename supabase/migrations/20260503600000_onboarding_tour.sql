-- Track whether a user has dismissed the first-run onboarding tour
-- so we don't pester them every dashboard visit. Null = haven't seen
-- it; timestamp = dismissed (whether by completing or skipping).

alter table public.profiles
  add column if not exists tour_dismissed_at timestamptz;
