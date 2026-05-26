-- Round-4 repair for the day_of_month backfill in
-- 20260526084000_vendor_recurring_day_of_month.sql, which reads
-- next_run_at as-is. Any rule that had silently drifted under the
-- old advance() bug (Jan 31 -> Feb 28 -> Mar 28 ...) was backfilled
-- with the DRIFTED day (28), permanently locking the vendor to the
-- wrong anchor.
--
-- Heuristic re-correction: for monthly cadence rules whose
-- next_run_at falls on the LAST day of a short month (Feb 28/29,
-- Apr 30, Jun 30, Sep 30, Nov 30), assume the vendor's original
-- intent was end-of-month (= 31). Setting day_of_month=31 lets the
-- new advance() clamp to whatever month's last day naturally —
-- which is what end-of-month billing wants.
--
-- This is a heuristic and will mis-correct rules whose vendors
-- ACTUALLY intended the 28th/30th and just happened to schedule
-- the next run on the last day of a short month. Mitigation: the
-- companion UI change only sets day_of_month on INSERT, never on
-- UPDATE — so vendors can fix the anchor by editing the rule. (The
-- editor still re-saves day_of_month from the date picker today,
-- but that's a follow-up if it becomes an issue.)
--
-- Rows where day_of_month was already 31 OR where next_run_at's
-- day is genuinely 31 are skipped (no drift possible — 31 is only
-- preserved by months that have a 31st).

update public.vendor_recurring_invoices
set day_of_month = 31
where interval in ('monthly', 'quarterly', 'yearly')
  and day_of_month is not null
  and day_of_month between 28 and 30
  -- The rule's next_run_at falls on the LAST day of a short month
  and (
    extract(day from next_run_at at time zone 'UTC') =
      extract(day from (date_trunc('month', next_run_at at time zone 'UTC') + interval '1 month - 1 day'))
  )
  -- Only when that "last day" is shorter than 31 — Mar/May/Jul/
  -- Aug/Oct/Dec/Jan have 31 days and an anchor there isn't drifted.
  and extract(day from (date_trunc('month', next_run_at at time zone 'UTC') + interval '1 month - 1 day')) < 31;
