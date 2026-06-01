-- Remove the recurring-INVOICES feature (the "Set up recurring" action
-- on a contact). Recurring EXPENSES (vendor_recurring_expenses + its
-- scan-vendor-recurring-expenses cron) are a separate feature and are
-- intentionally left in place.

-- 1. Unschedule the cron that drove the recurring-invoice emitter.
select cron.unschedule(jobid)
from cron.job
where command ilike '%scan-vendorapay-recurring%';

-- 2. Drop the now-unused table (0 rows; no inbound FKs).
drop table if exists public.vendor_recurring_invoices;
