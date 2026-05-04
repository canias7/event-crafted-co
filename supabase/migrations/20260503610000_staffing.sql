-- Day-of staffing marketplace. Vendors who price by the hour rather
-- than the package (bartenders, waitstaff, security, valets, day-of
-- coordinators). Same inquiry → proposal model as everyone else, just
-- specialized pricing fields the host can use to compare apples to
-- apples.
--
-- New columns on vendor_profiles for the hourly-billing pieces. They
-- coexist with base_price_cents (used as a flat starting price for
-- non-staffing vendors).

alter table public.vendor_profiles
  add column if not exists is_staffing boolean not null default false,
  add column if not exists hourly_rate_cents int,
  add column if not exists min_hours int;

create index if not exists vendor_profiles_staffing_idx
  on public.vendor_profiles (category, hourly_rate_cents)
  where is_staffing = true;
