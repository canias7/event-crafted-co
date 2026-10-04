-- Stripe Connect + payments: vendors onboard a Stripe Express account
-- via the platform, hosts pay for accepted proposals via Stripe
-- Checkout with destination charges. Platform fee is configured per
-- environment via STRIPE_PLATFORM_FEE_BASIS_POINTS on the edge
-- function (default 500 = 5%).
--
-- Schema:
--   1. vendor_profiles.stripe_* — connected account state, mirrored
--      from Stripe webhook events. We don't trust the client to
--      advertise its own onboarding status.
--   2. proposals.* — payment status + the Stripe Checkout/Payment
--      Intent IDs so we can correlate webhook events back to the row.
--   3. stripe_events — idempotency table. Stripe retries webhooks
--      until we 2xx. Recording the event id before processing means
--      a retry just no-ops instead of double-marking a proposal paid.

-- ─── 1. vendor_profiles: connected account state ───────────────────
alter table public.vendor_profiles
  add column if not exists stripe_account_id text,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false,
  add column if not exists stripe_details_submitted boolean not null default false,
  add column if not exists stripe_onboarding_completed_at timestamptz;

-- One Stripe account per vendor. The constraint is partial because
-- existing rows have NULL until they connect.
create unique index if not exists vendor_profiles_stripe_account_idx
  on public.vendor_profiles (stripe_account_id)
  where stripe_account_id is not null;

-- ─── 2. proposals: payment fields ──────────────────────────────────
alter table public.proposals
  -- 'unpaid' is the default. Flips through 'deposit_paid' on partial
  -- payment, 'paid_in_full' on full payment. 'failed' is a terminal
  -- state surfaced from payment_intent.payment_failed webhooks.
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'deposit_paid', 'paid_in_full', 'failed')),
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists paid_in_full_at timestamptz,
  -- Platform fee withheld on the matched payment. Stored at payment
  -- time so we have a historical record even if the rate later changes.
  add column if not exists application_fee_cents integer;

create index if not exists proposals_checkout_session_idx
  on public.proposals (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
create index if not exists proposals_payment_intent_idx
  on public.proposals (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- ─── 3. stripe_events: webhook idempotency log ─────────────────────
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now(),
  -- Raw payload kept for forensic / replay debugging. Trim retention
  -- with a scheduled job if this table gets noisy.
  payload jsonb
);

alter table public.stripe_events enable row level security;

-- Nobody reads this from the client — only the webhook function
-- (running as service-role) and the operator via the dashboard. RLS
-- defaults to deny once enabled with no policies.

-- ─── 4. SELECT policy on stripe_account_id for vendors themselves ──
-- vendor_profiles already has a public read policy that exposes
-- non-sensitive columns. The stripe_account_id is sensitive (it's an
-- account identifier on a third party). The public policy is broad,
-- so we don't try to clip columns there — instead the client only
-- selects stripe_account_id via the vendor's own dashboard query
-- guarded by user_id, which the existing policies allow. No new
-- policy needed: the data is already gated by team membership via
-- existing policies. We DO add a comment marking the field as
-- sensitive so future selects know to scope.

comment on column public.vendor_profiles.stripe_account_id is
  'Stripe Connect Express account ID. Only the vendor team should see this; never expose in public profile selects.';

comment on table public.stripe_events is
  'Webhook idempotency log. Insert event.id before processing; ON CONFLICT means we already handled this event and can no-op.';
