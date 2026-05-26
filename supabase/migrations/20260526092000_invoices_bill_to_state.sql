-- Track the buyer's billing-address state on each invoice so the
-- Reports tab can break down tax_cents by state — the answer to
-- "how much sales tax do I owe in each state?" that a vendor's
-- CPA needs at the end of each quarter.
--
-- Populated by the vendorapay-webhook on payment.succeeded for
-- invoice payments: pulls `charge.billing_details.address.state`
-- from the Stripe Charge (via the latest_charge expansion already
-- used for email resolution).
--
-- Two-letter US state code expected (CA, NY, TX); we don't coerce
-- the casing in SQL — the webhook upper-cases before insert so the
-- aggregate keys stay clean.

alter table public.invoices
  add column if not exists bill_to_state text;

-- Index supports the per-state aggregate query
--   select bill_to_state, sum(tax_cents) from invoices
--   where vendor_id = ? and paid_at between ? and ?
--   group by bill_to_state
-- on the paid subset only — drafts/sent rows aren't taxable yet.
create index if not exists invoices_vendor_paid_state_idx
  on public.invoices (vendor_id, paid_at)
  include (bill_to_state, tax_cents)
  where status = 'paid' and bill_to_state is not null;
