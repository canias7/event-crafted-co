-- HILUX actions v3: full chat behaviour toggle kit. Twenty-two new
-- boolean columns covering content, writing style, pacing, safety,
-- and operations. Each defaults to a sensible value so a vendor
-- with HILUX already enabled doesn't see behaviour change without
-- consent.
--
-- Code-level toggles (handled in the edge function, not prompt):
--   pause_weekends, skip_when_active, auto_mark_replied,
--   notify_on_reply
-- Everything else is a system-prompt rule.

alter table public.profiles
  -- What HILUX talks about
  add column if not exists hilux_action_mention_starting_price boolean not null default false,
  add column if not exists hilux_action_suggest_package boolean not null default true,
  add column if not exists hilux_action_decline_negotiation boolean not null default true,
  add column if not exists hilux_action_avoid_competitors boolean not null default true,
  add column if not exists hilux_action_send_portfolio_link boolean not null default false,
  add column if not exists hilux_action_offer_call boolean not null default true,
  add column if not exists hilux_action_share_booking_process boolean not null default true,
  -- How HILUX writes
  add column if not exists hilux_action_echo_question boolean not null default false,
  add column if not exists hilux_action_use_emojis boolean not null default false,
  add column if not exists hilux_action_acknowledge_emotion boolean not null default true,
  add column if not exists hilux_action_lead_with_question boolean not null default false,
  add column if not exists hilux_action_soft_cta_signoff boolean not null default true,
  add column if not exists hilux_action_allow_bullets boolean not null default false,
  -- How HILUX listens
  add column if not exists hilux_action_detect_frustration boolean not null default true,
  -- Safety & privacy
  add column if not exists hilux_action_refuse_legal boolean not null default true,
  add column if not exists hilux_action_refuse_competitor_pricing boolean not null default true,
  add column if not exists hilux_action_no_other_clients boolean not null default true,
  add column if not exists hilux_action_redact_contact boolean not null default true,
  -- Pacing (code-level)
  add column if not exists hilux_action_pause_weekends boolean not null default false,
  add column if not exists hilux_action_skip_when_active boolean not null default true,
  -- Operations (code-level)
  add column if not exists hilux_action_auto_mark_replied boolean not null default true,
  add column if not exists hilux_action_notify_on_reply boolean not null default false;
