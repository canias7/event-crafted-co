-- Transfer the always-on agent from HILUX to My Space.
--
-- The prior migration (20260605120000) tore down HILUX's auto-reply
-- trigger + crons. This re-wires the same autonomous behaviors to the
-- new My Space edge functions:
--   • my-space-respond       — auto-reply on inbound host messages
--   • my-space-follow-up     — daily nudge sweep for quiet threads
--   • my-space-archive-cold  — daily close-out of stale leads
--   • my-space-daily-summary — daily activity digest email
--
-- Config + data are unchanged: the agent still reads the kept
-- profiles.hilux_enabled master switch, direct_threads.hilux_paused
-- per-thread switch, hilux_action_* toggles, and writes to
-- hilux_action_log / direct_messages.is_hilux_generated. Only the
-- runtime that drives them moved from HILUX to My Space.

-- 1. Inbound-message auto-reply trigger -> my-space-respond.
--    Mirrors the final HILUX trigger (profile-scoped enable, per-thread
--    pause), best-effort pg_net post, loop-guarded on sender_role.
create or replace function public.tg_direct_messages_my_space_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url constant text :=
    'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/my-space-respond';
  v_enabled boolean;
  v_paused boolean;
begin
  if new.sender_role <> 'host' then
    return new;
  end if;

  select p.hilux_enabled, t.hilux_paused
    into v_enabled, v_paused
    from public.direct_threads t
    join public.vendor_profiles vp on vp.id = t.vendor_id
    join public.profiles p on p.id = vp.user_id
   where t.id = new.thread_id;

  if v_enabled is not true then
    return new;
  end if;

  if v_paused is true then
    return new;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'thread_id', new.thread_id,
        'message_id', new.id
      )
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists direct_messages_my_space_reply on public.direct_messages;
create trigger direct_messages_my_space_reply
  after insert on public.direct_messages
  for each row execute function public.tg_direct_messages_my_space_reply();

revoke execute on function public.tg_direct_messages_my_space_reply()
  from public, anon, authenticated;

-- 2. Crons. cron.schedule upserts by job name, so these are idempotent.

-- Follow-up nudges: 16:00 UTC (12pm ET / 9am PT).
select cron.schedule(
  'my-space-follow-up-daily',
  '0 16 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/my-space-follow-up',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);

-- Auto-archive cold leads: 17:00 UTC (1pm ET / 10am PT).
select cron.schedule(
  'my-space-archive-cold-daily',
  '0 17 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/my-space-archive-cold',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);

-- Daily summary digest: 16:00 UTC (12pm ET / 9am PT).
select cron.schedule(
  'my-space-daily-summary',
  '0 16 * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/my-space-daily-summary',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);
