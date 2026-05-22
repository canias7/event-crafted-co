-- Remove five HILUX Operations features the vendor cut from the
-- controls: email reply copies, chat field extraction, auto-archive
-- cold leads, booking-intent flagging, and the log-actions toggle.
-- Drops their profile columns. The auto-archive feature also had a
-- dedicated daily cron sweep (hilux-archive-cold), unscheduled here.
--
-- Note: hilux_action_log_actions is dropped but the hilux_action_log
-- table stays — HILUX now logs unconditionally, which still feeds the
-- daily summary and the Vendora MCP activity tools.

select cron.unschedule('hilux-archive-cold-daily');

alter table public.profiles
  drop column if exists hilux_action_email_reply_copies,
  drop column if exists hilux_action_update_inquiry_fields,
  drop column if exists hilux_action_auto_archive_cold,
  drop column if exists hilux_action_detect_booking_intent,
  drop column if exists hilux_action_log_actions;
