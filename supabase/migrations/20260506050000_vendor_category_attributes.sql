-- Per-category structured attributes for vendors.
--
-- Vendors have a free-text `category` (Photographer, Venue, etc.).
-- This column holds the *structured* fields specific to that
-- category — capacity for venues, package hours for photographers,
-- dress price range for bridal salons, etc.
--
-- Shape per category is enforced client-side via the schema
-- definitions in src/data/categoryAttributes.ts. Storing as JSONB
-- lets us iterate fast: adding a new field, removing one, or
-- adjusting an enum doesn't need a migration. Hot filter fields
-- can be promoted to typed columns later when query performance
-- matters.
--
-- Example shapes:
--   Venue:       { reception_starting_cents: 500000, max_guests: 250,
--                  settings: ["Garden","Mountain"], amenities: [...] }
--   Photographer:{ package_starting_cents: 350000, default_coverage_hours: 8,
--                  styles: ["Documentary"], second_shooter: true }

alter table public.vendor_profiles
  add column if not exists category_attributes jsonb not null default '{}'::jsonb;

-- GIN index so we can filter on facets later, e.g.
--   WHERE category_attributes->'settings' ? 'Garden'
--   WHERE category_attributes->'amenities' ?| array['Indoor Event Space','Dressing Room']
-- The jsonb_path_ops opclass is smaller + faster for ? / ?| / ?& /
-- @> queries (we don't need full GIN's @@ support).
create index if not exists vendor_profiles_category_attributes_idx
  on public.vendor_profiles using gin (category_attributes jsonb_path_ops);
