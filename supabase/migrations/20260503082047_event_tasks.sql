-- Host event task list (separate from checklist_items — checklist is "things
-- to acquire", tasks are "things to do" with priority + due_date + status).

create table public.event_tasks (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text,
  priority text check (priority in ('low','medium','high')),
  status text not null default 'pending' check (status in ('pending','in-progress','completed','overdue')),
  due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_tasks_host_idx
  on public.event_tasks (host_id, due_date, created_at);

alter table public.event_tasks enable row level security;

create policy "event_tasks host all"
  on public.event_tasks
  for all to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create trigger event_tasks_updated
  before update on public.event_tasks
  for each row execute function public.tg_set_updated_at();
