-- VendoraPay connection becomes account-level (one Stripe account per
-- user) instead of per-listing. vendor_id was the PK; swap to a
-- surrogate id PK so vendor_id can become optional metadata.
alter table public.vendor_payment_secrets drop constraint if exists vendor_payment_secrets_pkey;
alter table public.vendor_payment_secrets
  add column if not exists id uuid primary key default gen_random_uuid();
alter table public.vendor_payment_secrets
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

update public.vendor_payment_secrets s
   set user_id = vp.user_id
  from public.vendor_profiles vp
 where vp.id = s.vendor_id and s.user_id is null;

alter table public.vendor_payment_secrets
  alter column vendor_id drop not null;

-- One Stripe connection per account; keep per-listing uniqueness too
-- for the legacy functions that still resolve by vendor_id.
create unique index if not exists vendor_payment_secrets_user_idx
  on public.vendor_payment_secrets (user_id) where user_id is not null;
create unique index if not exists vendor_payment_secrets_vendor_idx
  on public.vendor_payment_secrets (vendor_id) where vendor_id is not null;
