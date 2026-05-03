-- Multi-event support per host. Until now profiles.event_* was a singleton
-- (one event per host), which forced an overwrite when a host wanted to
-- plan a second event (engagement → wedding, baby shower → first birthday).
-- Now host_events stores any number of events per host; profiles holds an
-- active_event_id pointing at the one currently in focus.

create table public.host_events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  event_type text not null check (event_type in ('wedding','birthday','holiday_dinner','other')),
  event_date date,
  event_location text,
  budget_min_cents integer,
  budget_max_cents integer,
  event_notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index host_events_host_idx
  on public.host_events (host_id, archived_at, created_at desc);

alter table public.host_events enable row level security;

create policy "host_events host all"
  on public.host_events
  for all to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create trigger host_events_updated
  before update on public.host_events
  for each row execute function public.tg_set_updated_at();

-- Pointer to the host's currently-active event.
alter table public.profiles
  add column active_event_id uuid references public.host_events(id) on delete set null;

-- Backfill: every host with an event_type gets a host_events row mirroring
-- their profile fields, and active_event_id points at it. Profile event_*
-- columns are kept for backwards compatibility — code can migrate gradually.
with new_events as (
  insert into public.host_events (
    host_id,
    event_type,
    event_date,
    event_location,
    budget_min_cents,
    budget_max_cents,
    event_notes,
    created_at,
    updated_at
  )
  select
    p.id,
    p.event_type,
    p.event_date,
    p.event_location,
    p.budget_min_cents,
    p.budget_max_cents,
    p.event_notes,
    coalesce(p.onboarded_at, p.created_at),
    p.updated_at
  from public.profiles p
  where p.event_type is not null
  returning id, host_id
)
update public.profiles p
set active_event_id = ne.id
from new_events ne
where p.id = ne.host_id;
