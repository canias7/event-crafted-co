-- Stripe price ID -> credit-package mapping.
--
-- The stripe-webhook function looks up the inbound price ID in this
-- table to decide:
--   - subscription: which tier to set + how many monthly credits
--     to grant on checkout / renewal
--   - topup: how many one-time credits to grant
--
-- Keeping this in a table (instead of hardcoded in the function)
-- means we can re-price or add tiers without re-deploying the
-- function — just INSERT a new row and update the existing one.

create table public.vendor_credit_packages (
  stripe_price_id text primary key,
  kind text not null check (kind in ('subscription', 'topup')),
  -- Subscription rows MUST set tier; topup rows MUST leave it null.
  tier text check (tier in ('starter', 'pro', 'studio')),
  credits integer not null check (credits > 0),
  display_name text not null,
  unit_amount_cents integer not null check (unit_amount_cents > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint credit_packages_tier_check check (
    (kind = 'subscription' and tier is not null) or
    (kind = 'topup' and tier is null)
  )
);

-- Service-role only. Vendors don't need to read this — the
-- VendorSubscriptionPage UI displays the catalog from a separate
-- safe view (or hardcoded constants on the client).
alter table public.vendor_credit_packages enable row level security;

-- Seed: the 7 prices created in Stripe (live mode) on 2026-05-23.
-- Subscription tier credit allotments:
--   Starter $14.99 -> 200 credits/mo
--   Pro     $39    -> 800 credits/mo
--   Studio  $99    -> 2,500 credits/mo
-- Top-up packs (one-time):
--   Boost      $12  -> 500 cr
--   Power      $30  -> 1,500 cr
--   Pro Pack   $60  -> 3,500 cr
--   Studio Pack $120 -> 8,000 cr
insert into public.vendor_credit_packages
  (stripe_price_id,                       kind,           tier,      credits, display_name,                     unit_amount_cents)
values
  ('price_1TaBvB2VPrcT6XA1fnKKxXVx',     'subscription', 'starter', 200,     'Vendora Starter',                1499),
  ('price_1TaBvD2VPrcT6XA1ZvEtx8gW',     'subscription', 'pro',     800,     'Vendora Pro',                    3900),
  ('price_1TaBvG2VPrcT6XA19uuNkLZH',     'subscription', 'studio',  2500,    'Vendora Studio',                 9900),
  ('price_1TaBvI2VPrcT6XA1XdeJWee8',     'topup',         null,     500,     'Vendora Credits — Boost Pack',   1200),
  ('price_1TaBvL2VPrcT6XA1annE7gNd',     'topup',         null,     1500,    'Vendora Credits — Power Pack',   3000),
  ('price_1TaBvN2VPrcT6XA1d0hcB7Ro',     'topup',         null,     3500,    'Vendora Credits — Pro Pack',     6000),
  ('price_1TaBvQ2VPrcT6XA11dQxKNRJ',     'topup',         null,     8000,    'Vendora Credits — Studio Pack',  12000);

-- Expand the subscription_tier check on vendor_profiles. The old
-- check only allowed 'free' and 'pro'; we now have 'starter' and
-- 'studio' too.
alter table public.vendor_profiles
  drop constraint if exists vendor_profiles_subscription_tier_check;
alter table public.vendor_profiles
  add constraint vendor_profiles_subscription_tier_check
  check (subscription_tier in ('free', 'starter', 'pro', 'studio'));
