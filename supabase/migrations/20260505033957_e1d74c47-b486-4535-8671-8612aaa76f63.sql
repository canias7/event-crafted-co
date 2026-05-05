create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null check (provider in ('google')),
  account_email text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz not null,
  primary_calendar_id text not null default 'primary',
  pull_busy_times boolean not null default true,
  push_appointments boolean not null default false,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
create index calendar_connections_user_idx on public.calendar_connections (user_id);
alter table public.calendar_connections enable row level security;
create policy "calendar_connections own select" on public.calendar_connections for select to authenticated using (auth.uid() = user_id);
create policy "calendar_connections own delete" on public.calendar_connections for delete to authenticated using (auth.uid() = user_id);
create policy "calendar_connections own update" on public.calendar_connections for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger calendar_connections_updated before update on public.calendar_connections for each row execute function public.tg_set_updated_at();

create table public.calendar_synced_busy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null check (provider in ('google')),
  external_event_id text not null,
  summary text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_all_day boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (user_id, provider, external_event_id)
);
create index calendar_synced_busy_user_window_idx on public.calendar_synced_busy (user_id, starts_at);
alter table public.calendar_synced_busy enable row level security;
create policy "calendar_synced_busy own select" on public.calendar_synced_busy for select to authenticated
  using (auth.uid() = user_id or exists (select 1 from public.vendor_profiles vp join public.vendor_team_members tm on tm.vendor_id = vp.id where vp.user_id = calendar_synced_busy.user_id and tm.user_id = auth.uid()));
create policy "calendar_synced_busy own delete" on public.calendar_synced_busy for delete to authenticated using (auth.uid() = user_id);