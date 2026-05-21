-- Live streaming for host events. Hosts going live broadcast through
-- Mux Live; viewers watch via Mux Player on a public, tokenized URL.
--
-- One stream resource per event. The mux_stream_key is the private
-- RTMP credential the host's browser/encoder uses to push video;
-- mux_playback_id is the public HLS handle anyone can watch from.
-- share_token gates the watch URL — public link, no auth required.
--
-- status mirrors Mux's lifecycle exactly:
--   idle          — created, never been active
--   active        — currently receiving video
--   recording     — variant of active with recording enabled
--   disconnected  — was active, host stopped pushing (recording may
--                   still be finalizing)
--   disabled      — admin-disabled

create table public.host_event_live_streams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.host_events(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  -- Mux resource identifiers. stream_key is treated as a secret —
  -- only the host sees it (and only via authenticated read paths;
  -- never exposed through the public watch RPC).
  mux_stream_id text not null unique,
  mux_stream_key text not null,
  mux_playback_id text not null unique,
  -- Set when Mux finalizes the recording asset after a stream ends.
  -- Replay plays from this asset via the same playback_id.
  mux_asset_id text,
  status text not null default 'idle' check (
    status in ('idle','active','recording','disconnected','disabled')
  ),
  -- Public URL slug. Base64-encoded random bytes — unguessable but
  -- not signed (we just need uniqueness + URL-safety, not crypto
  -- proofs). Replace later with a JWT if we add expiring links.
  share_token text not null unique
    default replace(replace(replace(encode(gen_random_bytes(9), 'base64'), '+', '-'), '/', '_'), '=', ''),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index host_event_live_streams_event_idx
  on public.host_event_live_streams (event_id);

alter table public.host_event_live_streams enable row level security;

-- Owner (host) can read/write their own streams. The webhook function
-- uses the service-role key so it bypasses RLS — that's the only
-- writer for status flips coming from Mux.
create policy "live_streams owner select"
  on public.host_event_live_streams for select to authenticated
  using (host_id = (select auth.uid()));

create policy "live_streams owner insert"
  on public.host_event_live_streams for insert to authenticated
  with check (host_id = (select auth.uid()));

create policy "live_streams owner update"
  on public.host_event_live_streams for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

create policy "live_streams owner delete"
  on public.host_event_live_streams for delete to authenticated
  using (host_id = (select auth.uid()));

-- Public watchers don't have an account. The RPC exposes only the
-- safe-to-share fields (playback_id, status, event title) — never
-- the stream_key. SECURITY DEFINER bypasses RLS in a controlled way.
create or replace function public.get_live_stream_by_token(p_token text)
returns table (
  id uuid,
  event_id uuid,
  event_title text,
  event_date date,
  event_start_time time,
  mux_playback_id text,
  status text,
  started_at timestamptz,
  ended_at timestamptz,
  has_recording boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    ls.id,
    ls.event_id,
    e.title,
    e.event_date,
    e.start_time,
    ls.mux_playback_id,
    ls.status,
    ls.started_at,
    ls.ended_at,
    (ls.mux_asset_id is not null) as has_recording
  from public.host_event_live_streams ls
    join public.host_events e on e.id = ls.event_id
   where ls.share_token = p_token
   limit 1;
$$;

grant execute on function public.get_live_stream_by_token(text)
  to anon, authenticated;

comment on column public.host_event_live_streams.mux_stream_key is
  'Mux RTMP stream key — secret. Never expose via public selects/RPCs.';
comment on function public.get_live_stream_by_token(text) is
  'Public-safe live stream lookup by share token. Returns only fields safe to broadcast; the stream_key stays in the table behind RLS.';
