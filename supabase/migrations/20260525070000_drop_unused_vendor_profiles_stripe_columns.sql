-- Audit cleanup: vendor_profiles.stripe_customer_id / stripe_subscription_id /
-- stripe_payment_intent_id are vestigial. The SaaS subscription state lives
-- on profiles (per-user, since migration 20260524000000_subscription_state_to_profiles).
-- Nothing in edge functions or the frontend writes these columns; the reads
-- all hit profiles.stripe_customer_id instead. Dead columns are confusing
-- and (because of the column-level REVOKE non-fix from PR #863/#864) also
-- a tiny defense-in-depth gap.
--
-- After this migration, vendor_profiles has zero Stripe-adjacent columns;
-- they all moved to vendor_payment_secrets in PR #883.

alter table public.vendor_profiles
  drop column if exists stripe_customer_id,
  drop column if exists stripe_subscription_id,
  drop column if exists stripe_payment_intent_id;
