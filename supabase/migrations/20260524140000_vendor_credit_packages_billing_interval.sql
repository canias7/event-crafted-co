-- Yearly subscription support. Adds a billing_interval column to
-- vendor_credit_packages so the same tier slug (starter / pro /
-- studio) can have both a monthly row and a yearly row, each with
-- their own Stripe price ID.
--
-- Default 'month' so every existing row is correctly classified
-- as a monthly plan. New yearly rows get inserted with
-- billing_interval='year'. Top-up packs always stay 'month' (or
-- could be ignored since they're one-time, not recurring).
alter table public.vendor_credit_packages
  add column if not exists billing_interval text
    not null default 'month';

alter table public.vendor_credit_packages
  add constraint vendor_credit_packages_billing_interval_chk
  check (billing_interval in ('month', 'year'));

-- Composite uniqueness: a vendor tier should have at most one row
-- per interval. (Stripe price IDs are already unique elsewhere by
-- design, this is just defense-in-depth against accidental dupes.)
create unique index if not exists vendor_credit_packages_tier_interval_uniq
  on public.vendor_credit_packages (tier, billing_interval)
  where kind = 'subscription' and tier is not null and active = true;
