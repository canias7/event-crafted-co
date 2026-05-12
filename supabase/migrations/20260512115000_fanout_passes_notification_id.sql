-- Pass notification_id to send-push so the function can log
-- push_events with a FK back to the originating notifications row.

create or replace function public.fanout_notification_to_push()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_url constant text := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/send-push';
begin
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'notification_id', new.id,
        'user_id', new.user_id,
        'title',   new.title,
        'body',    new.body,
        'link',    new.link,
        'tag',     new.type
      )
    );
  exception when others then
    null;
  end;
  return new;
end;
$function$;
