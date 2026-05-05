-- Drop the day-of staffing feature.
--
-- Removes the three vendor_profiles columns added by the original
-- staffing migration (20260503610000_staffing.sql) and the partial
-- index that supported the /staffing directory query.
--
-- The vendor categories themselves (Bartender, Waitstaff, Security,
-- Valet, Day-of Coordinator) are kept — they remain valid vendor
-- types, just billed via the standard base_price_cents / package
-- model like everyone else. Existing vendors who picked one of
-- these categories don't lose their profile; only the
-- hourly_rate / min_hours / is_staffing fields go away.
--
-- This is destructive — any data in those three columns is lost.
-- That's intentional per the product decision to retire the
-- staffing surface.

drop index if exists public.vendor_profiles_staffing_idx;

alter table public.vendor_profiles
  drop column if exists is_staffing,
  drop column if exists hourly_rate_cents,
  drop column if exists min_hours;
