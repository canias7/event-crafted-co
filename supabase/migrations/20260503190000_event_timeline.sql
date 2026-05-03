-- Event-day timeline: a sortable list of items happening on the day of
-- an event (e.g. "3:00 PM — Florals arrive", "5:30 PM — Ceremony").
--
-- Items are scoped per host_event so multi-event hosts get a separate
-- timeline per event. Each item has a start time (TIME of day, no
-- date), optional duration, owner (vendor or "us"), and notes.

create table public.event_timeline_items (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid references public.host_events(id) on delete cascade,
  start_time time not null,
  duration_minutes int,
  title text not null,
  owner_label text,
  vendor_id uuid references public.vendor_profiles(id) on delete set null,
  location text,
  notes text,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_timeline_items_event_idx
  on public.event_timeline_items (event_id, start_time, display_order);

create index event_timeline_items_host_idx
  on public.event_timeline_items (host_id, start_time);

alter table public.event_timeline_items enable row level security;

create policy "event_timeline_items host all"
  on public.event_timeline_items for all to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create trigger event_timeline_items_updated
  before update on public.event_timeline_items
  for each row execute function public.tg_set_updated_at();
