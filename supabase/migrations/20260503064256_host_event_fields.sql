-- Host event planning fields on profiles. Optional per-user "current event"
-- context captured during host onboarding. Used to personalize the dashboard
-- and pre-fill inquiry forms. Vendor / admin users leave these null.

alter table public.profiles
  add column event_type text check (event_type in ('wedding','birthday','holiday_dinner','other')),
  add column event_date date,
  add column event_location text,
  add column budget_min_cents integer,
  add column budget_max_cents integer,
  add column event_notes text,
  add column onboarded_at timestamptz;
