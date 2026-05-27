-- Scheduled actions queued by My Space ("at 5pm send Jamie the
-- contract"). The chat function inserts rows here; a pg_cron job
-- invokes the my-space-action-worker edge function every minute,
-- which picks up due rows and executes them. status moves
-- pending → executing → done | failed | cancelled.

create table if not exists public.my_space_scheduled_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid references public.vendor_profiles(id) on delete cascade,
  run_at timestamptz not null,
  kind text not null check (kind in (
    'send_host_reply',
    'send_email',
    'mark_notifications_read'
  )),
  args jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in (
    'pending', 'executing', 'done', 'failed', 'cancelled'
  )),
  executed_at timestamptz,
  error_message text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists my_space_scheduled_actions_due_idx
  on public.my_space_scheduled_actions (run_at)
  where status = 'pending';

create index if not exists my_space_scheduled_actions_user_idx
  on public.my_space_scheduled_actions (user_id, run_at desc);

alter table public.my_space_scheduled_actions enable row level security;

create policy "my_space_scheduled_actions_owner_select"
  on public.my_space_scheduled_actions
  for select
  using (user_id = auth.uid());

create policy "my_space_scheduled_actions_owner_cancel"
  on public.my_space_scheduled_actions
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

select cron.schedule(
  'my-space-action-worker',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/my-space-action-worker',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );
  $$
);
