-- VendoraPay overdue-invoice auto-reminders.
--
-- Cron schedules up to 3 reminder emails to the host once an invoice
-- goes overdue (~3-day cadence: day 0, day 3, day 6). After that the
-- cron stops; vendor handles further follow-up manually.
--
-- reminder_count tracks how many we've sent; last_reminder_at gates
-- the next one. Partial index keeps the cron scan cheap.

alter table public.invoices
  add column if not exists reminder_count integer not null default 0,
  add column if not exists last_reminder_at timestamptz;

create index if not exists invoices_overdue_reminders_idx
  on public.invoices(last_reminder_at)
  where status = 'overdue' and reminder_count < 3;
