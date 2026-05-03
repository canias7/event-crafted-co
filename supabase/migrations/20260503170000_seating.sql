-- Seating chart: hosts create tables and assign guests to them. Each
-- guest is assigned to at most one table, so the assignment lives as
-- a column on event_guests rather than a separate join table.

create table public.event_tables (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  capacity int not null default 8 check (capacity between 1 and 30),
  shape text not null default 'round' check (shape in ('round','rect')),
  display_order int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_tables_host_idx
  on public.event_tables (host_id, display_order, created_at);

alter table public.event_tables enable row level security;

create policy "event_tables host all"
  on public.event_tables for all to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create trigger event_tables_updated
  before update on public.event_tables
  for each row execute function public.tg_set_updated_at();

-- Add table assignment to event_guests. ON DELETE SET NULL so deleting
-- a table returns its guests to the unassigned pool rather than wiping
-- them out.
alter table public.event_guests
  add column if not exists table_id uuid
    references public.event_tables(id) on delete set null,
  add column if not exists seat_index int;

create index if not exists event_guests_table_idx
  on public.event_guests (table_id, seat_index);
