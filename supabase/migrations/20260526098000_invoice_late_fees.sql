-- Late-fee tracking on invoices. The vendor can add a late fee to
-- any overdue invoice. We store the fee separately from the line-
-- items array (so it's clearly an after-the-fact charge, not part
-- of the original engagement) but we DO roll it into total_cents
-- — that way the existing checkout/Pay flow charges the buyer the
-- combined amount without conditional branching everywhere.
--
-- late_fee_added_at is the audit timestamp; helpful if a buyer
-- disputes the fee and the vendor needs to show when it was applied.

alter table public.invoices
  add column if not exists late_fee_cents integer not null default 0
    check (late_fee_cents >= 0),
  add column if not exists late_fee_added_at timestamptz;
