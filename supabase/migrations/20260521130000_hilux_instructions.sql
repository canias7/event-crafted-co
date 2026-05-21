-- HILUX v1.1: per-listing custom instructions, ChatGPT-style.
-- Vendor types free-form guidance (tone, rules, off-limits topics,
-- style hooks) on /vendor/super-agents. The hilux-respond edge
-- function appends this to the system prompt so replies sound like
-- the vendor wants them to sound.

alter table public.vendor_profiles
  add column if not exists hilux_instructions text;
