-- Drop the "Quiet hours overnight" and "Pause on weekends" HILUX
-- pacing toggles. HILUX is an always-on agent — it replies
-- whenever a host messages. Vendors who want to take over a
-- conversation still have per-thread pause + "Defer when I'm in
-- the thread".

alter table public.profiles
  drop column if exists hilux_action_quiet_hours,
  drop column if exists hilux_action_pause_weekends;
