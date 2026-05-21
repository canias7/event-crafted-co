-- Operations toggles v3. Adds four more high-value ops controls.
-- Behaviour is stored only — backend implementation lands in
-- separate PRs as we wire each. The user-facing UI surfaces the
-- toggle so vendors can opt in early.

alter table public.profiles
  add column if not exists hilux_action_daily_summary boolean not null default false,
  add column if not exists hilux_action_cap_replies_per_inquiry boolean not null default false,
  add column if not exists hilux_action_detect_booking_intent boolean not null default true,
  add column if not exists hilux_action_log_actions boolean not null default false;
