-- Web Push subscriptions. One row per (user, browser) — a single user
-- can have multiple devices subscribed. The browser's Push API gives us
-- an endpoint URL plus two keys (p256dh + auth) we use to encrypt the
-- payload before posting to the endpoint.
--
-- send-push edge function reads this table and fires for each row.
-- A trigger on `notifications` enqueues a push for the recipient any
-- time a notification is inserted, so vendors and hosts get a real
-- ping for inquiries / messages / proposals without each call site
-- having to remember to fire push themselves.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  -- The endpoint URL is the unique identifier per (user, device); a
  -- duplicate insert means the same browser re-subscribed (e.g. after
  -- clearing site data) and we should overwrite the keys.
  unique (user_id, endpoint)
);

create index push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions own select"
  on public.push_subscriptions for select to authenticated
  using (auth.uid() = user_id);

create policy "push_subscriptions own insert"
  on public.push_subscriptions for insert to authenticated
  with check (auth.uid() = user_id);

create policy "push_subscriptions own delete"
  on public.push_subscriptions for delete to authenticated
  using (auth.uid() = user_id);

-- Trigger fanout: any new notification → POST to the send-push edge
-- function for that user. Uses pg_net (auto-enabled in Supabase) so
-- the trigger is non-blocking. Wrapped in EXCEPTION so it can't break
-- the parent insert if pg_net isn't available or the function is down.
create or replace function public.fanout_notification_to_push()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  -- These two settings are populated by the Supabase platform. If
  -- absent we silently skip — push is best-effort.
  begin
    v_url := current_setting('app.settings.supabase_url', true);
    v_key := current_setting('app.settings.service_role_key', true);
  exception when others then
    return new;
  end;

  if v_url is null or v_key is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := v_url || '/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'user_id', new.user_id,
        'title', new.title,
        'body', new.body,
        'link', new.link,
        'tag', new.type
      )
    );
  exception when others then
    -- pg_net not available, function down, etc. — silently swallow.
    null;
  end;
  return new;
end$$;

drop trigger if exists notifications_fanout_push on public.notifications;
create trigger notifications_fanout_push
  after insert on public.notifications
  for each row execute function public.fanout_notification_to_push();

revoke execute on function public.fanout_notification_to_push() from public, anon, authenticated;
