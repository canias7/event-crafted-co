-- Manual events that a host plans through the portal. Distinct from
-- `inquiries` (which derives "events" from any vendor a host has
-- contacted) — host_events is the host's own calendar of things
-- they're planning, independent of whether a vendor is involved yet.

create table public.host_events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  event_type text,
  event_date date not null,
  start_time time,
  end_time time,
  location text,
  guest_count integer,
  budget_min_cents bigint,
  budget_max_cents bigint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index host_events_host_date_idx on public.host_events (host_id, event_date desc);

alter table public.host_events enable row level security;

create policy "host_events own select"
  on public.host_events for select to authenticated
  using (host_id = (select auth.uid()));

create policy "host_events own insert"
  on public.host_events for insert to authenticated
  with check (host_id = (select auth.uid()));

create policy "host_events own update"
  on public.host_events for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

create policy "host_events own delete"
  on public.host_events for delete to authenticated
  using (host_id = (select auth.uid()));

create or replace function public.tg_host_events_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger host_events_touch_updated_at
  before update on public.host_events
  for each row execute function public.tg_host_events_touch_updated_at();
