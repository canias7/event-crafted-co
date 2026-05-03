-- Guest VIP tagging + bulk message log.
--
-- VIP: a per-guest priority flag for wedding party / immediate family /
-- key VIPs. Surfaces in the seating chart + guest list with a different
-- pin color so the host can prioritize them at a glance.
--
-- Bulk message log: when a host sends a "blast" email to all guests,
-- record the send + the body so they can see the history. The actual
-- email send is a fire-and-forget edge function call from the frontend.

alter table public.event_guests
  add column if not exists is_vip boolean not null default false,
  add column if not exists vip_role text;
  -- vip_role is freeform: "Maid of Honor", "Best Man", "Mother of bride", etc.

create index if not exists event_guests_vip_idx
  on public.event_guests (host_id)
  where is_vip = true;

create table public.guest_message_blasts (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  body text not null,
  sent_to_count int not null default 0,
  sent_at timestamptz not null default now(),
  -- Audience filter snapshot at send time (jsonb so we can extend without
  -- migrations). Today: { rsvp_status: 'attending'|'all', vip_only: bool }
  audience jsonb not null default '{}'::jsonb
);

create index guest_message_blasts_host_idx
  on public.guest_message_blasts (host_id, sent_at desc);

alter table public.guest_message_blasts enable row level security;

create policy "guest_message_blasts host all"
  on public.guest_message_blasts for all to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);
