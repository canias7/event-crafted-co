-- My Space chat persistence. One thread per conversation; many
-- messages per thread. Owner-only via RLS keyed on auth.uid().
-- Title is auto-generated server-side on the first user message.

create table if not exists public.my_space_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists my_space_threads_user_updated_idx
  on public.my_space_threads (user_id, updated_at desc);

create table if not exists public.my_space_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.my_space_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  type text not null default 'text' check (type in ('text','image')),
  content text,
  image_url text,
  image_prompt text,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

create index if not exists my_space_messages_thread_created_idx
  on public.my_space_messages (thread_id, created_at asc);

alter table public.my_space_threads enable row level security;
alter table public.my_space_messages enable row level security;

-- Threads: owner-only across all operations.
create policy "my_space_threads_owner_select"
  on public.my_space_threads
  for select
  using (user_id = auth.uid());

create policy "my_space_threads_owner_insert"
  on public.my_space_threads
  for insert
  with check (user_id = auth.uid());

create policy "my_space_threads_owner_update"
  on public.my_space_threads
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "my_space_threads_owner_delete"
  on public.my_space_threads
  for delete
  using (user_id = auth.uid());

-- Messages: owner-only. The edge function writes via service role,
-- bypassing RLS, but the client only ever reads its own.
create policy "my_space_messages_owner_select"
  on public.my_space_messages
  for select
  using (user_id = auth.uid());

create policy "my_space_messages_owner_insert"
  on public.my_space_messages
  for insert
  with check (user_id = auth.uid());

create policy "my_space_messages_owner_delete"
  on public.my_space_messages
  for delete
  using (user_id = auth.uid());

-- Touch thread.updated_at whenever a message is inserted, so the
-- sidebar can sort by most recent activity.
create or replace function public.touch_my_space_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.my_space_threads
    set updated_at = now()
    where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists my_space_messages_touch_thread on public.my_space_messages;
create trigger my_space_messages_touch_thread
  after insert on public.my_space_messages
  for each row execute function public.touch_my_space_thread();
