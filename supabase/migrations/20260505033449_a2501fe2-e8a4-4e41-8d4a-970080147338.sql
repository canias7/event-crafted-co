create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, endpoint)
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

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

create or replace function public.fanout_notification_to_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text; v_key text;
begin
  begin
    v_url := current_setting('app.settings.supabase_url', true);
    v_key := current_setting('app.settings.service_role_key', true);
  exception when others then return new; end;
  if v_url is null or v_key is null then return new; end if;
  begin
    perform net.http_post(
      url := v_url || '/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),
      body := jsonb_build_object('user_id', new.user_id, 'title', new.title, 'body', new.body, 'link', new.link, 'tag', new.type)
    );
  exception when others then null; end;
  return new;
end$$;

drop trigger if exists notifications_fanout_push on public.notifications;
create trigger notifications_fanout_push
  after insert on public.notifications
  for each row execute function public.fanout_notification_to_push();

revoke execute on function public.fanout_notification_to_push() from public, anon, authenticated;