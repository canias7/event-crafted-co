-- See drop_calendar_sync_push_subs_notif_prefs applied via Supabase MCP.

drop table if exists public.calendar_synced_busy  cascade;
drop table if exists public.calendar_connections  cascade;
drop table if exists public.push_subscriptions    cascade;

alter table public.profiles
  drop column if exists notification_prefs,
  drop column if exists daily_digest_enabled,
  drop column if exists reengagement_emails_enabled;

create or replace function public.is_notif_enabled(p_user_id uuid, p_pref text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select true;
$function$;

create or replace function public.enqueue_pending_digests()
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_row record;
begin
  for v_row in
    select n.user_id, count(*) as cnt
    from public.notifications n
    join public.profiles p on p.id = n.user_id
    where n.read_at is null
      and n.created_at < now() - interval '1 hour'
      and n.queued_for_digest_at is null
    group by n.user_id
  loop
    update public.notifications
       set queued_for_digest_at = now()
     where user_id = v_row.user_id
       and read_at is null
       and queued_for_digest_at is null;
  end loop;
end;
$function$;
