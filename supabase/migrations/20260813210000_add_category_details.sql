-- Category-specific listing details. Each category group (Venues, Food
-- & Beverage, ...) asks its own questions in the listing builder; the
-- answers all live here as one JSONB document so new categories never
-- need schema churn. Venues ships first (venue types, capacities,
-- spaces, amenities, policies, services, ...).
alter table public.vendor_profiles
  add column if not exists category_details jsonb not null default '{}'::jsonb;

comment on column public.vendor_profiles.category_details is
  'Category-specific listing form answers (shape varies by category group; see apps mobile venue-listing wizard). Vendors edit via their own RLS update policy.';
