-- Remove My Space (the AI super-agent / HILUX auto-responder) entirely.
--
-- Drops its cron jobs, triggers, helper functions and the my_space_* /
-- hilux_* tables (owner approved dropping the data), plus profile
-- settings columns that nothing reads any more.
--
-- Kept on purpose:
--   * profiles.hilux_enabled and direct_threads.hilux_paused: vendor-app
--     builds released before this change still select them; dropping
--     them would break the thread header until every install takes the OTA.
--   * direct_threads.hilux_typing_until, direct_messages.is_hilux_generated:
--     history. Past AI-sent messages still show "Sent automatically".
--   * auto_reply_on_inquiry (the static, vendor-written auto-reply). Only
--     its "HILUX takes precedence" bypass is removed.

-- 1. Cron jobs that called the my-space-* edge functions.
do $$
declare j record;
begin
  for j in
    select jobid from cron.job
    where jobname in (
      'my-space-action-worker',
      'my-space-proactive',
      'my-space-follow-up-daily',
      'my-space-archive-cold-daily',
      'my-space-daily-summary'
    )
  loop
    perform cron.unschedule(j.jobid);
  end loop;
exception when undefined_table or invalid_schema_name then
  null; -- pg_cron not installed (local replay)
end $$;

-- 2. Triggers and their functions.
drop trigger if exists direct_messages_my_space_reply on public.direct_messages;
drop trigger if exists trg_enforce_hilux_premium on public.profiles;
drop function if exists public.tg_direct_messages_my_space_reply();
drop function if exists public.enforce_hilux_premium();

-- 3. Tables (their own triggers go with them).
drop table if exists public.my_space_action_audit cascade;
drop table if exists public.my_space_pending_confirmations cascade;
drop table if exists public.my_space_scheduled_actions cascade;
drop table if exists public.my_space_custom_tools cascade;
drop table if exists public.my_space_active_listing cascade;
drop table if exists public.my_space_messages cascade;
drop table if exists public.my_space_threads cascade;
drop table if exists public.my_space_knowledge cascade;
drop table if exists public.hilux_action_log cascade;
drop table if exists public.hilux_private_config cascade;
drop function if exists public.touch_my_space_thread();
drop function if exists public.set_my_space_knowledge_updated_at();

-- 4. Settings columns nothing reads any more.
alter table public.profiles
  drop column if exists hilux_action_use_calendar,
  drop column if exists hilux_action_use_first_name,
  drop column if exists hilux_action_decline_negotiation,
  drop column if exists hilux_action_offer_call,
  drop column if exists hilux_action_detect_frustration,
  drop column if exists hilux_action_notify_on_reply,
  drop column if exists hilux_action_notify_on_hot_lead,
  drop column if exists hilux_action_daily_summary,
  drop column if exists hilux_action_cap_replies_per_inquiry,
  drop column if exists axion_autosave,
  drop column if exists my_space_disabled_tools;
alter table public.vendor_profiles
  drop column if exists my_space_preferences;

-- 5. The static auto-reply no longer defers to HILUX.
create or replace function public.auto_reply_on_inquiry()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_settings public.vendor_scheduling_settings%rowtype;
  v_thread uuid;
  v_body text;
  v_req date;
  v_alt text := '';
  v_d date;
  v_found int := 0;
begin
  select user_id into v_owner from public.vendor_profiles where id = new.vendor_id;
  if v_owner is null or not public.is_premium_user(v_owner) then return new; end if;
  select * into v_settings from public.vendor_scheduling_settings where user_id = v_owner;
  if not found or not v_settings.auto_reply_enabled
     or coalesce(trim(v_settings.auto_reply_text), '') = '' then
    return new;
  end if;
  begin
    insert into public.automation_events (user_id, kind, target_id)
    values (v_owner, 'auto_reply', new.id);
  exception when unique_violation then
    return new;
  end;

  select id into v_thread from public.direct_threads where inquiry_id = new.id limit 1;
  if v_thread is null then
    insert into public.direct_threads (inquiry_id, host_id, vendor_id)
    values (new.id, new.host_id, new.vendor_id)
    returning id into v_thread;
  end if;

  v_body := trim(v_settings.auto_reply_text);

  if v_settings.alt_dates_enabled and new.event_date is not null then
    begin
      v_req := new.event_date;
      if not public.vendor_day_open(new.vendor_id, v_req) then
        v_d := greatest(v_req - 7, current_date + 1);
        while v_found < 3 and v_d <= v_req + 45 loop
          if v_d <> v_req and v_d > current_date
             and public.vendor_day_open(new.vendor_id, v_d) then
            v_alt := v_alt || case when v_found > 0 then ', ' else '' end
              || to_char(v_d, 'FMMon FMDD');
            v_found := v_found + 1;
          end if;
          v_d := v_d + 1;
        end loop;
        if v_found > 0 then
          v_body := v_body || e'\n\nHeads up — '
            || to_char(v_req, 'FMMon FMDD')
            || ' may already be taken on our calendar, but we''re open on '
            || v_alt || '. Would one of those work?';
        end if;
      end if;
    exception when others then
      null;
    end;
  end if;

  insert into public.direct_messages (thread_id, sender_id, sender_role, body)
  values (v_thread, v_owner, 'vendor', v_body);
  update public.direct_threads set last_message_at = now() where id = v_thread;
  return new;
exception when others then
  return new;
end;
$function$;
