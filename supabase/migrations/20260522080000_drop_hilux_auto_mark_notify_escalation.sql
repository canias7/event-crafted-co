-- Bake two HILUX "Operations" toggles into permanent behavior:
--
--   auto_mark_replied    — HILUX always flips a 'new' inquiry to
--                          'replied' once it answers.
--   notify_on_escalation — an escalation always alerts the vendor
--                          team (in-app + "Action needed" email);
--                          it's too time-sensitive to be opt-in.

alter table public.profiles
  drop column if exists hilux_action_auto_mark_replied,
  drop column if exists hilux_action_notify_on_escalation;
