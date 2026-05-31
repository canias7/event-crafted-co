-- Admin "Delete account" was blocked for any vendor with billing history.
--
-- The VendoraPay financial tables (payment_links, invoices, expenses,
-- recurring expenses, contractors, payout reconciliations) reference
-- auth.users via created_by/reconciled_by with the DEFAULT on-delete
-- rule (NO ACTION). Every other user-referencing FK in the schema is
-- already CASCADE or SET NULL, so deleting a user normally fans out
-- cleanly — but these six refused, and since a delete is one atomic
-- transaction, ANY refusal rolled the whole thing back. Result: the
-- admin Delete button only worked on brand-new accounts that had never
-- touched billing, and threw a FK-violation toast for real vendors.
--
-- Intended behavior: deleting a user removes everything that user owns,
-- including their financial records. So these six move to ON DELETE
-- CASCADE — the pay links, invoices, and expenses go with the account.
-- (Money already moved lives at the payment provider and is untouched;
-- this only affects our in-app record.)
--
-- Children of these tables (recurring invoices/expenses pointers, the
-- payment_links self-reference, contractor links) are all already
-- ON DELETE SET NULL, so the cascade has no downstream blocker.

alter table public.payment_links
  drop constraint payment_links_created_by_fkey,
  add constraint payment_links_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.invoices
  drop constraint invoices_created_by_fkey,
  add constraint invoices_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.vendor_expenses
  drop constraint vendor_expenses_created_by_fkey,
  add constraint vendor_expenses_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.vendor_recurring_expenses
  drop constraint vendor_recurring_expenses_created_by_fkey,
  add constraint vendor_recurring_expenses_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.vendor_contractors
  drop constraint vendor_contractors_created_by_fkey,
  add constraint vendor_contractors_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.vendor_payout_reconciliations
  drop constraint vendor_payout_reconciliations_reconciled_by_fkey,
  add constraint vendor_payout_reconciliations_reconciled_by_fkey
    foreign key (reconciled_by) references auth.users(id) on delete cascade;
