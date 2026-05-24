-- Round-2 audit C2 + H1: the original seed
-- (20260523060000_vendor_credit_packages.sql) used:
--   - old live-mode Stripe price IDs (price_1TaBv...)
--   - em-dash display names ("Vendora Credits — Boost Pack")
-- Live data was hand-patched to current test-mode IDs and
-- no-em-dash names, but a fresh `db reset` would reinstate the
-- broken state. The catalog-columns backfill
-- (20260524020000_*) WHERE-matches the no-em-dash names, so on
-- a clean reset the display_order updates miss and all top-ups
-- land at display_order=0 in arbitrary order.
--
-- Canonicalize by upserting BY tier+kind+credits (stable across
-- price-id rotation) so this migration is the new source of truth
-- regardless of what previous migrations seeded.

-- Subscriptions
update public.vendor_credit_packages
   set display_name = 'Vendora Starter',
       stripe_price_id = 'price_1TaKot2VPrcT6XA1pMa6Q1fY',
       unit_amount_cents = 1499,
       was_monthly_cents = 2900,
       display_order = 1,
       listings_copy = '1 listing',
       highlights = jsonb_build_array(
         '200 AI credits / month',
         '250 gallery images'
       ),
       active = true
 where kind = 'subscription' and tier = 'starter';

update public.vendor_credit_packages
   set display_name = 'Vendora Pro',
       stripe_price_id = 'price_1TaKpC2VPrcT6XA17I2TSi6u',
       unit_amount_cents = 3900,
       was_monthly_cents = 8900,
       display_order = 2,
       listings_copy = 'Up to 5 listings',
       highlights = jsonb_build_array(
         '800 AI credits / month',
         '1,000 gallery images',
         'MCP connection'
       ),
       active = true
 where kind = 'subscription' and tier = 'pro';

update public.vendor_credit_packages
   set display_name = 'Vendora Studio',
       stripe_price_id = 'price_1TaKpY2VPrcT6XA1EfBgJryx',
       unit_amount_cents = 9900,
       was_monthly_cents = 24900,
       display_order = 3,
       listings_copy = 'Up to 5 listings',
       highlights = jsonb_build_array(
         '2,500 AI credits / month',
         '2,000 gallery images',
         'Become verified',
         'MCP connection'
       ),
       active = true
 where kind = 'subscription' and tier = 'studio';

-- Top-ups (keyed by credit count which is stable across price-id rotation)
update public.vendor_credit_packages
   set display_name = 'Vendora Credits Boost Pack',
       stripe_price_id = 'price_1TaKq72VPrcT6XA1AeyBHdnn',
       unit_amount_cents = 1200,
       display_order = 1,
       active = true
 where kind = 'topup' and credits = 500;

update public.vendor_credit_packages
   set display_name = 'Vendora Credits Power Pack',
       stripe_price_id = 'price_1TaKqc2VPrcT6XA1kr2icZHw',
       unit_amount_cents = 3000,
       display_order = 2,
       active = true
 where kind = 'topup' and credits = 1500;

update public.vendor_credit_packages
   set display_name = 'Vendora Credits Pro Pack',
       stripe_price_id = 'price_1TaKr12VPrcT6XA1YjzZcylM',
       unit_amount_cents = 6000,
       display_order = 3,
       active = true
 where kind = 'topup' and credits = 3500;

update public.vendor_credit_packages
   set display_name = 'Vendora Credits Studio Pack',
       stripe_price_id = 'price_1TaKrZ2VPrcT6XA1SmiwGeis',
       unit_amount_cents = 12000,
       display_order = 4,
       active = true
 where kind = 'topup' and credits = 8000;
