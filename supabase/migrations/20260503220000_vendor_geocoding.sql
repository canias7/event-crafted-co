-- Vendor geocoding: store latitude/longitude on vendor_profiles so the
-- /vendors/map view can pin them on a real map. Populated by a
-- geocode-vendor edge function that calls Nominatim (OSM's free
-- geocoding service) on vendor profile save.
--
-- Both columns nullable — vendors who haven't been geocoded yet just
-- show up in the side list instead of as pins.

alter table public.vendor_profiles
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocoded_location text;
  -- geocoded_location captures the location string at geocode time so
  -- we can detect when location text changes and re-geocode.

-- Partial index over geocoded vendors so map queries are fast.
create index if not exists vendor_profiles_geocoded_idx
  on public.vendor_profiles (latitude, longitude)
  where latitude is not null and longitude is not null;
