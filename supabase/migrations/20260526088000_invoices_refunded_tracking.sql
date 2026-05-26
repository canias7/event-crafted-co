-- Track refunded amount + timestamp on invoices so the Reports tab
-- can show refunds as a discrete line on the sales report and
-- compute Net = Gross - Refunds cleanly. Stripe's charge.refunded
-- webhook gives us amount_refunded (cumulative) which the vendor-
-- apay-webhook handler will stamp here on each refund event.

alter table public.invoices
  add column if not exists refunded_amount_cents integer not null default 0,
  add column if not exists refunded_at timestamptz;

-- Index the refund timestamp for the Reports query that filters
-- `where vendor_id = ? and refunded_at between ?`. Partial index
-- on the non-null subset keeps it small for vendors that have
-- never refunded.
create index if not exists invoices_vendor_refunded_at_idx
  on public.invoices (vendor_id, refunded_at desc)
  where refunded_at is not null;
