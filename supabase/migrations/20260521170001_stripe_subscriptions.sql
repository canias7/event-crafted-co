-- Pivot from marketplace payments to platform subscriptions.
--
-- The previous migration (20260521160000_stripe_payments.sql) wired
-- up Stripe Connect Express for vendor-receives-payments-from-hosts.
-- That was the wrong model for Vendora — we charge VENDORS a flat
-- monthly subscription for access to the platform, hosts use it free.
--
-- This migration:
--   1. Drops the marketplace columns (none of them had production
--      data yet; the connect onboarding never reached real users).
--   2. Keeps stripe_events — webhook idempotency is still needed.
--   3. Adds subscription state columns on vendor_profiles. All
--      driven by webhook; never written from the client.
--
-- Tier is 'free' or 'pro'. Status mirrors Stripe Subscription.status
-- so we can show the right CTA: active/trialing → Manage,
-- past_due → "Update card", canceled → "Resubscribe".

-- ─── 1. Drop marketplace columns ───────────────────────────────────
alter table public.vendor_profiles
  drop column if exists stripe_account_id,
  drop column if exists stripe_charges_enabled,
  drop column if exists stripe_payouts_enabled,
  drop column if exists stripe_details_submitted,
  drop column if exists stripe_onboarding_completed_at;

drop index if exists public.vendor_profiles_stripe_account_idx;

alter table public.proposals
  drop column if exists payment_status,
  drop column if exists stripe_checkout_session_id,
  drop column if exists stripe_payment_intent_id,
  drop column if exists deposit_paid_at,
  drop column if exists paid_in_full_at,
  drop column if exists application_fee_cents;

drop index if exists public.proposals_checkout_session_idx;
drop index if exists public.proposals_payment_intent_idx;

-- ─── 2. Subscription columns on vendor_profiles ───────────────────
alter table public.vendor_profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'pro')),
  -- Mirrors Stripe Subscription.status. Null for vendors who never
  -- subscribed (their tier is 'free' and that's the source of truth).
  add column if not exists subscription_status text
    check (
      subscription_status is null
      or subscription_status in (
        'active','trialing','past_due','canceled',
        'incomplete','incomplete_expired','unpaid','paused'
      )
    ),
  add column if not exists subscription_current_period_end timestamptz,
  add column if not exists subscription_cancel_at_period_end boolean
    not null default false;

create unique index if not exists vendor_profiles_stripe_customer_idx
  on public.vendor_profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists vendor_profiles_stripe_subscription_idx
  on public.vendor_profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on column public.vendor_profiles.stripe_customer_id is
  'Stripe Customer ID for this vendor''s billing relationship. Sensitive; never exposed via public profile selects.';
comment on column public.vendor_profiles.subscription_tier is
  'Plan tier — driven exclusively by webhook. ''free'' is the default; ''pro'' unlocks Pro features.';
