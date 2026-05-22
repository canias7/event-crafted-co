-- Drop four HILUX toggles that are now baked into the agent's
-- default behavior / personality rather than being vendor-tunable:
--
--   mention_starting_price  — HILUX has the price in context; it
--                             answers cost questions naturally.
--   suggest_package         — now a permanent prompt rule.
--   avoid_competitors       — now a permanent prompt rule.
--   acknowledge_emotion     — now part of HILUX's baked-in warmth.

alter table public.profiles
  drop column if exists hilux_action_mention_starting_price,
  drop column if exists hilux_action_suggest_package,
  drop column if exists hilux_action_avoid_competitors,
  drop column if exists hilux_action_acknowledge_emotion;
