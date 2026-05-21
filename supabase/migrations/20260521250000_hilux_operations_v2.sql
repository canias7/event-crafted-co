-- More Operations toggles for HILUX. Defaults chosen so existing
-- behaviour stays the same (escalation notification stays on,
-- hot-lead notification on so the vendor sees the most important
-- signal, the rest off because they're either spammy or intrusive
-- until the vendor opts in).

alter table public.profiles
  add column if not exists hilux_action_update_inquiry_fields boolean not null default false,
  add column if not exists hilux_action_notify_on_escalation boolean not null default true,
  add column if not exists hilux_action_notify_on_hot_lead boolean not null default true,
  add column if not exists hilux_action_email_reply_copies boolean not null default false,
  add column if not exists hilux_action_auto_archive_cold boolean not null default false;
