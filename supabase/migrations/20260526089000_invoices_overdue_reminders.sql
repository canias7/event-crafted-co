-- Overdue invoice reminders. Vendors don't want to babysit their
-- AR; the scan-vendorapay-overdue cron emails the buyer a friendly
-- nudge 1+ day after due_date, then re-nudges weekly until the
-- invoice is paid or cancelled.
--
-- reminder_sent_at = wall-clock of the last nudge. Null = no
-- reminder sent yet. Used both to throttle (don't re-nudge within
-- 7 days) and surfaced on the invoice row in My Vendora.

alter table public.invoices
  add column if not exists reminder_sent_at timestamptz;

-- Partial index for the scan query: vendors with no overdue invoices
-- don't pay for the index. The scan filters
--   status = 'sent' AND due_date < now()
-- and the per-row throttle reads reminder_sent_at — the (due_date)
-- key supports the inequality, and reminder_sent_at is included so
-- the throttle check stays on the index.
create index if not exists invoices_overdue_scan_idx
  on public.invoices (due_date)
  include (reminder_sent_at)
  where status = 'sent' and due_date is not null;
