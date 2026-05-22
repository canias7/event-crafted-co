-- Bake the last three HILUX Conversation toggles into the agent's
-- default behavior rather than vendor-tunable switches:
--
--   share_booking_process — HILUX always outlines the next step
--                           when a host shows booking intent.
--   echo_question         — HILUX naturally reflects the question
--                           back before answering.
--   lead_with_question    — HILUX stays consultative, asking about
--                           the event alongside answering.

alter table public.profiles
  drop column if exists hilux_action_share_booking_process,
  drop column if exists hilux_action_echo_question,
  drop column if exists hilux_action_lead_with_question;
