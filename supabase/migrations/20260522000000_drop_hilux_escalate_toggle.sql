-- Remove the "Escalate when uncertain" toggle. HILUX now always
-- replies — when it genuinely can't answer it offers to loop in
-- the team rather than going silent. The only remaining
-- escalation is the frustrated-host handoff
-- (hilux_action_detect_frustration), which stays.

alter table public.profiles drop column if exists hilux_action_escalate;
