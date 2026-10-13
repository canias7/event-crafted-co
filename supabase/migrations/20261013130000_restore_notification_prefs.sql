-- Bring back profiles.notification_prefs.
--
-- 20260515240000 dropped the column, but the code kept using it:
--   * Settings -> Notifications loads and saves it, so every switch there
--     has failed silently since May.
--   * send-transactional-email's new_inquiry path filters vendor team
--     members by it; with the column gone that query errored and NO
--     new-inquiry emails were sent.
--   * The host reply emails (20261013121000) read reply_email from it.
-- A missing key means "on" everywhere, so an empty object keeps every
-- email and notification on until someone switches one off.

alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- The notify_* triggers call this to honour the switches; it was
-- stubbed to always return true when the column was dropped.
create or replace function public.is_notif_enabled(p_user_id uuid, p_pref text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select (p.notification_prefs ->> p_pref)::boolean
       from public.profiles p
      where p.id = p_user_id),
    true
  );
$function$;
