-- Per-vendor My Space tool switches.
--
-- Lets a vendor turn individual My Space tools on/off. Disabled tools
-- are dropped from the tool list sent to Claude on every chat turn, so
-- a trimmed set means fewer tokens in the (cached) tools prefix and
-- sharper tool selection.
--
-- We store the DISABLED set (not the enabled set) so that:
--   • default '[]' = every tool on = no change for existing vendors, and
--   • any tool we add later defaults to ON until a vendor turns it off.
alter table public.profiles
  add column if not exists my_space_disabled_tools jsonb not null default '[]'::jsonb;
