-- Three more per-action toggles for HILUX:
--   ask_clarifying — when the host's message is vague, ask one
--     focused clarifying question instead of guessing or dumping
--     every package.
--   use_first_name — open the reply with the host's first name
--     (pulled from profiles.display_name) when it's known.
--   quiet_hours    — pause replies overnight. v1 uses a fixed UTC
--     window approximating US-Eastern 11pm–7am; per-vendor TZ
--     support is future work.

alter table public.profiles
  add column if not exists hilux_action_ask_clarifying boolean not null default true;

alter table public.profiles
  add column if not exists hilux_action_use_first_name boolean not null default true;

alter table public.profiles
  add column if not exists hilux_action_quiet_hours boolean not null default false;
