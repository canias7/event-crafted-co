-- Allow hosts to publish their own real events directly. Today only
-- vendors can — they create the row and need the host's consent flag
-- to flip it public. This forward-migration adds a host-led path so
-- a host can take their own finished event and publish it as a
-- public SEO page (a "real event" gallery). Each host-published
-- event is a permanent indexable URL with vendor credit links —
-- doubles as social proof + content engine fuel.
--
-- Schema changes:
--   - host_id: new nullable column, FK to profiles
--   - vendor_id: relax NOT NULL (host-published events have no
--     primary vendor — they may credit multiple)
--   - constraint: one of host_id / vendor_id must be set
--   - host_consent_given_at: still required for public read on
--     vendor-led events; host-led events implicitly have consent
--     because the host is the publisher
--
-- RLS additions:
--   - host owner can insert / update / delete their own row
--   - public read policy now also allows host-led published events

-- ─── Schema ─────────────────────────────────────────────────────

alter table public.real_events
  add column if not exists host_id uuid
    references public.profiles(id) on delete cascade;

alter table public.real_events
  alter column vendor_id drop not null;

-- Drop the old "vendor_id NOT NULL" implicit, add a CHECK that exactly
-- one of host_id / vendor_id is set. (We allow both to be set so a
-- host can credit their primary vendor, but at least one is required.)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'real_events_owner_required'
  ) then
    alter table public.real_events
      add constraint real_events_owner_required
      check (host_id is not null or vendor_id is not null);
  end if;
end $$;

create index if not exists real_events_host_idx
  on public.real_events (host_id, created_at desc)
  where host_id is not null;

-- Track which storage bucket the cover + gallery live in. Vendor-led
-- events use 'vendor-portfolios' (existing default — backfilled
-- below). Host-led events use 'event-microsites' since hosts can't
-- write to vendor-portfolios.
alter table public.real_events
  add column if not exists media_bucket text not null
    default 'vendor-portfolios';

update public.real_events
  set media_bucket = 'vendor-portfolios'
  where media_bucket is null;

-- ─── RLS ───────────────────────────────────────────────────────

-- Replace the existing public read policy to cover both paths.
drop policy if exists "real_events public read" on public.real_events;

create policy "real_events public read"
  on public.real_events for select
  using (
    published_at is not null
    and (
      -- Vendor-led: vendor uploads a row; host signed consent.
      (vendor_id is not null and host_consent_given_at is not null)
      or
      -- Host-led: the host themselves published the row.
      host_id is not null
    )
  );

-- Host owns their own real-event rows (read draft + write).
create policy "real_events host insert"
  on public.real_events for insert to authenticated
  with check (host_id = auth.uid());

create policy "real_events host update"
  on public.real_events for update to authenticated
  using (host_id = auth.uid());

create policy "real_events host delete"
  on public.real_events for delete to authenticated
  using (host_id = auth.uid());

create policy "real_events host read draft"
  on public.real_events for select to authenticated
  using (host_id = auth.uid());
