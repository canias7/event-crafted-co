-- Remove the always-on HILUX agent (code-only teardown).
--
-- The 7 hilux-* edge functions are deleted in this same change. This
-- migration tears down the runtime that drove them:
--   1. the AFTER INSERT trigger on direct_messages that pinged
--      hilux-respond on every inbound host message, and
--   2. the three HILUX cron jobs (follow-up, archive-cold, daily-summary).
--
-- We deliberately KEEP all HILUX data + schema:
--   profiles.hilux_enabled, vendor_profiles.hilux_enabled,
--   direct_threads.hilux_paused, direct_messages.is_hilux_generated,
--   hilux_private_config, hilux_action_log, inquiry_scores, and the
--   hilux_action_* toggle columns. My Space still reads/writes these via
--   vendora-mcp + my-space-chat, and they give us a clean base to rebuild
--   HILUX on later.

-- 1. Drop the inbound-message auto-reply trigger + its function.
drop trigger if exists direct_messages_hilux_reply on public.direct_messages;
drop function if exists public.tg_direct_messages_hilux_reply();

-- 2. Unschedule the HILUX cron jobs (no-op if they aren't present).
do $$
declare
  j text;
begin
  for j in
    select jobname from cron.job
    where jobname in (
      'hilux-follow-up-daily',
      'hilux-archive-cold-daily',
      'hilux-daily-summary'
    )
  loop
    perform cron.unschedule(j);
  end loop;
end $$;
