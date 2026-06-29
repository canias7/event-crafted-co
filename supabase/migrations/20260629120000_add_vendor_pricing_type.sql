-- Vendors can price a listing as a flat rate, an hourly rate, or "custom"
-- (contact-for-quote, no number). base_price_cents holds the flat price or
-- the hourly rate; for 'custom' it is null/ignored. Existing listings are
-- flat-rate, so default to 'flat'.
alter table public.vendor_profiles
  add column if not exists pricing_type text not null default 'flat';

alter table public.vendor_profiles
  drop constraint if exists vendor_profiles_pricing_type_check;
alter table public.vendor_profiles
  add constraint vendor_profiles_pricing_type_check
  check (pricing_type in ('flat','hourly','custom'));
