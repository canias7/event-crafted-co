-- Two fixes from the connectors audit (PR #862):
--
-- 1. Re-add vendor_profiles.stripe_account_id
--    Migration 20260521170000 dropped this column when the platform
--    pivoted from marketplace Connect to SaaS subscriptions, but
--    stripe-connect-onboard edge function and VendorIntegrationsPage
--    still reference it. Without the column, the "Connect Stripe"
--    button fails silently and the badge stays on "Connect" forever.
--    Re-added as a separate column from stripe_customer_id (which is
--    the vendor's Vendora-subscription customer, distinct from their
--    own merchant account).
--
-- 2. Revoke column-level SELECT from anon on payment_handles +
--    stripe_account_id. The vendor_profiles 'public read approved'
--    policy returns ALL columns, which would let any scraper pull
--    every approved vendor's Venmo / Cash App / Zelle handles plus
--    their Stripe account ID. Postgres RLS is row-level only, so we
--    close this at the column-grant layer. Authenticated keeps the
--    grant (host inquiry flow joins vendor_profiles in
--    HostInquiryDetailPage and needs both columns to render
--    VendorPaymentButtons).

alter table public.vendor_profiles
  add column if not exists stripe_account_id text;

create unique index if not exists vendor_profiles_stripe_account_idx
  on public.vendor_profiles (stripe_account_id)
  where stripe_account_id is not null;

revoke select (payment_handles, stripe_account_id)
  on public.vendor_profiles
  from anon;
