-- Two-way external calendar sync. v1 ships INBOUND sync for Google
-- Calendar — when a vendor (or host) connects their account, we
-- periodically pull busy events from their primary calendar into
-- calendar_synced_busy. The vendor availability page renders these
-- alongside manually-added unavailable dates so the vendor doesn't
-- have to maintain two calendars.
--
-- Outbound sync (push our appointments to their Google Calendar) is
-- v2 — adds an external_event_id column on appointments + a periodic
-- write-side reconcile.
--
-- Operator setup (one-time):
--   1. Create a Google Cloud project + enable the Calendar API.
--   2. Configure the OAuth consent screen + create Web Application
--      credentials. Authorized redirect URI:
--        <SUPABASE_URL>/functions/v1/google-calendar-oauth?action=callback
--   3. Set in Supabase project secrets:
--        GOOGLE_OAUTH_CLIENT_ID
--        GOOGLE_OAUTH_CLIENT_SECRET
--        GOOGLE_OAUTH_STATE_SECRET (any 32-byte random string)
--        APP_URL (e.g. https://vendora.app)
--   4. Schedule sync-google-calendar to run every 15-30 minutes via
--      Supabase cron (pg_cron net.http_post).
--
-- Tokens are stored as plain text. For production-grade encryption use
-- Supabase Vault and wrap the columns with vault.create_secret(); the
-- shape stays the same.

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google')),
  account_email text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz not null,
  primary_calendar_id text not null default 'primary',
  -- Toggles. Inbound is the default — pulling busy events into Vendora.
  -- Outbound (push appointments to the connected calendar) is v2 and
  -- the column is here so the UI can already collect the preference.
  pull_busy_times boolean not null default true,
  push_appointments boolean not null default false,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One connection per (user, provider). Reconnecting overwrites.
  unique (user_id, provider)
);

create index calendar_connections_user_idx
  on public.calendar_connections (user_id);

alter table public.calendar_connections enable row level security;

-- Tokens are sensitive — only the owning user reads their row, and
-- service-role-key (used by the sync edge function) bypasses RLS.
create policy "calendar_connections own select"
  on public.calendar_connections for select to authenticated
  using (auth.uid() = user_id);

create policy "calendar_connections own delete"
  on public.calendar_connections for delete to authenticated
  using (auth.uid() = user_id);

create policy "calendar_connections own update"
  on public.calendar_connections for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- (No insert policy — connections are created by the edge function
-- via service-role key after the OAuth callback.)

create trigger calendar_connections_updated
  before update on public.calendar_connections
  for each row execute function public.tg_set_updated_at();

-- Busy events pulled from the connected calendar. external_event_id +
-- (user_id, provider) is unique so the sync upsert is idempotent.
create table public.calendar_synced_busy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google')),
  external_event_id text not null,
  summary text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_all_day boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (user_id, provider, external_event_id)
);

create index calendar_synced_busy_user_window_idx
  on public.calendar_synced_busy (user_id, starts_at);

alter table public.calendar_synced_busy enable row level security;

-- Owner reads their own rows. Vendor team members can read each other's
-- so the vendor team availability shows blocks added by any teammate.
create policy "calendar_synced_busy own select"
  on public.calendar_synced_busy for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.vendor_profiles vp
      join public.vendor_team_members tm on tm.vendor_id = vp.id
      where vp.user_id = calendar_synced_busy.user_id
        and tm.user_id = auth.uid()
    )
  );

create policy "calendar_synced_busy own delete"
  on public.calendar_synced_busy for delete to authenticated
  using (auth.uid() = user_id);
