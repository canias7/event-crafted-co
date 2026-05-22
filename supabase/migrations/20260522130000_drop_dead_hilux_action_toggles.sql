-- Drop five HILUX action columns no longer surfaced in the UI and no
-- longer gating any prompt content. matchLanguage, askClarifying,
-- useEmojis, softCtaSignoff, and allowBullets used to be vendor
-- toggles, but their rules in buildSystemPrompt have been baked in
-- unconditionally. The shared TS module is cleaned up in the same
-- change.

alter table public.profiles
  drop column if exists hilux_action_match_language,
  drop column if exists hilux_action_ask_clarifying,
  drop column if exists hilux_action_use_emojis,
  drop column if exists hilux_action_soft_cta_signoff,
  drop column if exists hilux_action_allow_bullets;
