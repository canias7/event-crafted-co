-- Throttle the My Space scheduled-action worker from every minute to
-- every 5 minutes. On an empty queue each tick is a single 0-row
-- UPDATE, so the only effect is a scheduled action firing up to ~5
-- minutes late instead of ~1 — well worth ~80% fewer idle invocations
-- (≈1,440/day → ≈288/day).
select cron.alter_job(
  job_id := (select jobid from cron.job
              where command ilike '%my-space-action-worker%' limit 1),
  schedule := '*/5 * * * *'
);
