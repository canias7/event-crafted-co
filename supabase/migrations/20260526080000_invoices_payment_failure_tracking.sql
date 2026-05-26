-- Track buyer payment attempts on an invoice. Stripe surfaces the
-- decline reason on payment_intent.payment_failed; we persist it
-- so vendors see *why* an invoice is stalled without diving into
-- raw event payloads.
--
-- payment_failed_at is cleared on successful payment so a paid
-- invoice never lingers with a stale decline message attached.

alter table public.invoices
  add column if not exists payment_failure_message text,
  add column if not exists payment_failed_at timestamptz,
  add column if not exists payment_attempts integer not null default 0;

comment on column public.invoices.payment_failure_message is
  'Most recent buyer-side decline reason from Stripe payment_intent.payment_failed.';
comment on column public.invoices.payment_failed_at is
  'When the most recent failed attempt occurred. Cleared on successful payment.';
comment on column public.invoices.payment_attempts is
  'Count of distinct PaymentIntents observed for this invoice. Mostly informational.';
