-- Drop the "Mention portfolio in first reply" HILUX toggle
-- (hilux_action_send_portfolio_link). Removed from the vendor
-- controls — HILUX no longer carries a dedicated first-reply
-- portfolio nudge.

alter table public.profiles
  drop column if exists hilux_action_send_portfolio_link;
