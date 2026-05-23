-- Audit fix #2 + #4: vendor_credit_packages becomes the source of
-- truth for the subscription + top-up catalog. Until now the
-- front-end hardcoded TIERS/TOPUPS arrays (price ids, display
-- copy, tier highlights), which meant going live = swap 7 ids in
-- code + redeploy + reseed the DB. Three places to keep in sync,
-- and #4 (zero RLS policies on this table) meant the front-end
-- couldn't read it anyway.
--
-- This migration:
--   1. Adds the columns the UI needs (display_order, listings_copy,
--      was_monthly_cents, highlights jsonb).
--   2. Backfills them for the existing 7 rows from the hardcoded
--      arrays in VendorSubscriptionPage.tsx.
--   3. Adds a public-read RLS policy for active rows so the
--      front-end can fetch the catalog from any session.
--
-- Free tier stays UI-only (no Stripe price, no checkout, no point
-- round-tripping the DB).

alter table public.vendor_credit_packages
  add column if not exists display_order integer not null default 0,
  add column if not exists listings_copy text,
  add column if not exists was_monthly_cents integer,
  add column if not exists highlights jsonb;

-- Backfill subscription tiers
update public.vendor_credit_packages set
  display_order = 1,
  listings_copy = '1 listing',
  was_monthly_cents = 2900,
  highlights = jsonb_build_array(
    '200 AI credits / month',
    '250 gallery images'
  )
where tier = 'starter';

update public.vendor_credit_packages set
  display_order = 2,
  listings_copy = 'Up to 5 listings',
  was_monthly_cents = 8900,
  highlights = jsonb_build_array(
    '800 AI credits / month',
    '1,000 gallery images',
    'MCP connection'
  )
where tier = 'pro';

update public.vendor_credit_packages set
  display_order = 3,
  listings_copy = 'Up to 5 listings',
  was_monthly_cents = 24900,
  highlights = jsonb_build_array(
    '2,500 AI credits / month',
    '2,000 gallery images',
    'Become verified',
    'MCP connection'
  )
where tier = 'studio';

-- Backfill top-ups
update public.vendor_credit_packages set display_order = 1
  where display_name = 'Vendora Credits Boost Pack';
update public.vendor_credit_packages set display_order = 2
  where display_name = 'Vendora Credits Power Pack';
update public.vendor_credit_packages set display_order = 3
  where display_name = 'Vendora Credits Pro Pack';
update public.vendor_credit_packages set display_order = 4
  where display_name = 'Vendora Credits Studio Pack';

-- RLS: ensure the table has RLS enabled (audit #4 said it does
-- but had zero policies). Public read for active rows; writes
-- stay service-role only.
alter table public.vendor_credit_packages enable row level security;

drop policy if exists vendor_credit_packages_public_read on public.vendor_credit_packages;
create policy vendor_credit_packages_public_read
  on public.vendor_credit_packages
  for select
  to anon, authenticated
  using (active = true);

grant select on public.vendor_credit_packages to anon, authenticated;
