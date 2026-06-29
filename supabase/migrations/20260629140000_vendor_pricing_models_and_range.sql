-- Richer listing pricing: vendors pick one or more PRICING MODELS, give a
-- typical price RANGE (min/max), and flag whether pricing is CUSTOM (varies
-- by event). Supersedes the single pricing_type. base_price_cents is kept in
-- sync with price_min_cents for back-compat (benchmarks, completeness, etc.).
alter table public.vendor_profiles
  add column if not exists pricing_models text[] not null default '{}',
  add column if not exists price_min_cents integer,
  add column if not exists price_max_cents integer,
  add column if not exists custom_pricing boolean not null default false;

alter table public.vendor_profiles
  drop constraint if exists vendor_profiles_pricing_models_check;
alter table public.vendor_profiles
  add constraint vendor_profiles_pricing_models_check
  check (
    pricing_models <@ array[
      'fixed_packages','hourly','per_person','starting_at','custom_quote'
    ]::text[]
  );

-- Backfill from the prior single pricing_type + base_price_cents.
update public.vendor_profiles
set
  price_min_cents = coalesce(price_min_cents, base_price_cents),
  custom_pricing  = (pricing_type = 'custom'),
  pricing_models  = case
    when pricing_models <> '{}'::text[] then pricing_models
    when pricing_type = 'hourly' then array['hourly']
    when pricing_type = 'custom' then array['custom_quote']
    else array['starting_at']
  end;
