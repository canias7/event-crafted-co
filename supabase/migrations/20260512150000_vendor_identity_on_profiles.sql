-- Split vendor identity from per-listing data. Until now the Profile
-- tab read business_name / category / location / bio / logo_url from
-- the user's earliest vendor_profiles row, which meant:
--   * Vendors with multiple listings only showed one city / category
--   * Editing the profile was indistinguishable from editing the
--     listing (Edit profile routed to the listing builder).
--
-- Now: profile-level identity lives on public.profiles. Listings keep
-- their own location / category / etc. The two can diverge — vendors
-- pick a brand presence for their profile, and individual listings
-- can target different cities / categories.
--
-- Backfill copies each user's earliest vendor_profile values into
-- their profiles row so nothing visible changes for existing accounts.

alter table public.profiles
  add column if not exists business_name text,
  add column if not exists category      text,
  add column if not exists location      text,
  add column if not exists bio           text,
  add column if not exists logo_url      text;

-- Backfill — only fills rows where profiles.business_name is still
-- null, so re-running the migration is idempotent.
update public.profiles p
set
  business_name = coalesce(p.business_name, vp.business_name),
  category      = coalesce(p.category,      vp.category),
  location      = coalesce(p.location,      vp.location),
  bio           = coalesce(p.bio,           vp.bio),
  logo_url      = coalesce(p.logo_url,      vp.logo_url)
from (
  select distinct on (user_id)
    user_id, business_name, category, location, bio, logo_url
  from public.vendor_profiles
  order by user_id, created_at asc
) vp
where vp.user_id = p.id;
