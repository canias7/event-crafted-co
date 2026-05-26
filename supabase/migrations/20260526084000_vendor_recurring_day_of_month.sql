-- Audit-3 fixes for vendor_recurring_invoices.day_of_month:
--
-- 1. Backfill from existing rows. The round-2 advance() refactor
--    introduced day_of_month re-anchoring to prevent monthly-rule
--    drift, but the column was never populated (the web save
--    handler omits it and the column had no default). Every
--    existing rule has day_of_month=NULL and falls back to
--    `from.getUTCDate()` — same drift as pre-PR.
--    Backfill from the current next_run_at::date day so existing
--    rules immediately benefit.
--
-- 2. CHECK constraint. The smallint column allows 0 and negative
--    values; advance() with `Math.min(0, 31) = 0` then computes
--    `Date.UTC(year, month, 0)` which is the LAST day of the
--    PREVIOUS month, returning a date earlier than `from`. The
--    catch-up `while (nextRun <= now)` loop spins forever in that
--    case. Constrain to [1, 31] at the DB level so a direct SQL
--    write can't plant a pathological value.

update public.vendor_recurring_invoices
set day_of_month = extract(day from next_run_at at time zone 'UTC')::smallint
where day_of_month is null
  and interval in ('monthly', 'quarterly', 'yearly');

alter table public.vendor_recurring_invoices
  add constraint vendor_recurring_invoices_day_of_month_check
    check (day_of_month is null or (day_of_month between 1 and 31));
