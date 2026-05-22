-- Drop the two HILUX "Pacing" toggles. Both are now permanent
-- agent behavior rather than vendor-tunable switches:
--
--   follow_up        — HILUX always sends one gentle follow-up
--                      nudge when a host goes quiet after a reply.
--   skip_when_active — HILUX always defers when the vendor posted
--                      a manual reply in the thread in the last 30 min.

alter table public.profiles
  drop column if exists hilux_action_follow_up,
  drop column if exists hilux_action_skip_when_active;
