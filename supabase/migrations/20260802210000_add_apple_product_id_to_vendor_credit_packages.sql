-- Apple In-App Purchase product identifiers, so the RevenueCat webhook can
-- map an Apple product back to a Vendora tier the same data-driven way the
-- Stripe path maps stripe_price_id -> tier. Nullable: rows without an Apple
-- product simply aren't purchasable on iOS.
alter table public.vendor_credit_packages
  add column if not exists apple_product_id text;

-- One Apple product maps to at most one package row.
create unique index if not exists vendor_credit_packages_apple_product_id_key
  on public.vendor_credit_packages (apple_product_id)
  where apple_product_id is not null;

comment on column public.vendor_credit_packages.apple_product_id is
  'Apple App Store product identifier for this package (auto-renewable subscription or consumable). Null when the package is not sold on iOS. Used by the revenuecat-webhook edge function to resolve tier/credits.';
