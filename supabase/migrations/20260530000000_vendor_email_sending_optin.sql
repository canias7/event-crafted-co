-- Per-listing opt-in for outbound vendor->client emails.
--
-- Until a vendor flips this on, emails they send to their clients
-- (invoice sends, paid receipts, overdue + balance-due reminders) are
-- blocked and NOT billed. Platform/admin notifications are unaffected.
--
-- Default false = explicit opt-in (vendors must "sign up" in the Email
-- settings section). Existing senders are grandfathered to true so the
-- new gate doesn't silently stop invoice/receipt flows that already work.
alter table vendor_profiles
  add column if not exists email_sending_enabled boolean not null default false;

update vendor_profiles vp
   set email_sending_enabled = true
 where vp.email_sending_enabled = false
   and (
     exists (select 1 from invoices i
              where i.vendor_id = vp.id and i.sent_at is not null)
     or exists (select 1 from vendor_email_domains d
                 where d.vendor_id = vp.id)
   );
