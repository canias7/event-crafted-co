-- The original push fanout trigger (20260503430000_push_subscriptions.sql)
-- relied on `current_setting('app.settings.supabase_url')` and
-- `app.settings.service_role_key` being set on the database. They
-- never were, so the trigger has been silently no-oping since day one
-- — no push notification has ever fired.
--
-- The fix: hardcode the project URL (it's public information) and drop
-- the auth header requirement. `send-push` is deployed with
-- verify_jwt = false, so the edge function accepts unauthenticated
-- calls from the database.

create or replace function public.fanout_notification_to_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url constant text := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/send-push';
begin
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'user_id', new.user_id,
        'title',   new.title,
        'body',    new.body,
        'link',    new.link,
        'tag',     new.type
      )
    );
  exception when others then
    -- pg_net unavailable / network blip — never block the notification
    -- insert. The user will still see the in-app notification.
    null;
  end;
  return new;
end;
$$;

-- Trigger definition is unchanged; the function body is the bit that
-- was broken. Recreating to be explicit and to drop any stale state.
drop trigger if exists notifications_fanout_push on public.notifications;
create trigger notifications_fanout_push
  after insert on public.notifications
  for each row execute function public.fanout_notification_to_push();

revoke execute on function public.fanout_notification_to_push()
  from public, anon, authenticated;
