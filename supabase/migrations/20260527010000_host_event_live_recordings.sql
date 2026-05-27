-- Append-only log of completed live recordings. The host_event_live_streams
-- row is the live "resource" (Mux live stream + share token) and stays
-- 1:1 with the event; this table captures each finished broadcast that
-- Mux finalized into a playable asset.
--
-- Why a separate table:
--   1. A host can go live multiple times for the same event (engagement
--      party + ceremony + reception). Each broadcast is its own asset
--      with its own playback_id.
--   2. The streams table only tracks the *latest* asset (mux_asset_id);
--      that's fine for "is replay ready?" but doesn't support an
--      archive UI.
--
-- mux_playback_id is the asset's own playback id — distinct from the
-- live stream's playback id (which Mux reuses for the next broadcast).
-- The asset id and playback id come from the video.asset.ready webhook.

create table public.host_event_live_recordings (
  id uuid primary key default gen_random_uuid(),
  live_stream_id uuid not null references public.host_event_live_streams(id) on delete cascade,
  event_id uuid not null references public.host_events(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  mux_asset_id text not null unique,
  mux_playback_id text not null,
  duration_seconds numeric,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index host_event_live_recordings_event_idx
  on public.host_event_live_recordings (event_id, started_at desc nulls last);

create index host_event_live_recordings_stream_idx
  on public.host_event_live_recordings (live_stream_id, started_at desc nulls last);

alter table public.host_event_live_recordings enable row level security;

-- Owner can read their own recordings. Inserts come from the webhook
-- function (service role, bypasses RLS) so no insert policy is needed
-- for authenticated callers.
create policy "live_recordings owner select"
  on public.host_event_live_recordings for select to authenticated
  using (host_id = (select auth.uid()));

create policy "live_recordings owner delete"
  on public.host_event_live_recordings for delete to authenticated
  using (host_id = (select auth.uid()));

-- Public RPC: list recordings for a stream identified by share_token.
-- The token is the public gate — anyone with the link can watch any
-- recording from the stream, same as the live broadcast.
create or replace function public.get_live_recordings_by_token(p_token text)
returns table (
  id uuid,
  mux_playback_id text,
  duration_seconds numeric,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    r.id,
    r.mux_playback_id,
    r.duration_seconds,
    r.started_at,
    r.ended_at,
    r.created_at
  from public.host_event_live_recordings r
    join public.host_event_live_streams ls on ls.id = r.live_stream_id
   where ls.share_token = p_token
   order by r.started_at desc nulls last, r.created_at desc;
$$;

grant execute on function public.get_live_recordings_by_token(text)
  to anon, authenticated;

-- Public RPC: fetch one recording by id, gated by the parent stream's
-- share_token. Used when the watch page opens with `?replay=<id>` —
-- the token comes from the URL path, the id from the query string.
create or replace function public.get_recording_by_token_and_id(
  p_token text,
  p_id uuid
)
returns table (
  id uuid,
  event_title text,
  event_date date,
  mux_playback_id text,
  duration_seconds numeric,
  started_at timestamptz,
  ended_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    r.id,
    e.title,
    e.event_date,
    r.mux_playback_id,
    r.duration_seconds,
    r.started_at,
    r.ended_at
  from public.host_event_live_recordings r
    join public.host_event_live_streams ls on ls.id = r.live_stream_id
    join public.host_events e on e.id = ls.event_id
   where ls.share_token = p_token
     and r.id = p_id
   limit 1;
$$;

grant execute on function public.get_recording_by_token_and_id(text, uuid)
  to anon, authenticated;

-- Realtime: postgres_changes lets the host's events page flip a LIVE
-- badge the moment Mux's webhook updates the row, without polling.
-- Recordings publication powers the archive UI updating after a stream
-- ends and Mux finalizes the asset.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'host_event_live_streams'
  ) then
    alter publication supabase_realtime add table public.host_event_live_streams;
  end if;

  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'host_event_live_recordings'
  ) then
    alter publication supabase_realtime add table public.host_event_live_recordings;
  end if;
end$$;

comment on table public.host_event_live_recordings is
  'Finalized Mux recording assets, one row per broadcast. Webhook (video.asset.ready) inserts here as well as stamping host_event_live_streams.mux_asset_id with the latest.';
comment on function public.get_live_recordings_by_token(text) is
  'Public list of recordings for a live stream by share_token.';
comment on function public.get_recording_by_token_and_id(text, uuid) is
  'Public recording lookup gated by the parent stream''s share_token.';
