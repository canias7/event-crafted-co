-- Guest list + RSVP. Hosts manage their own guests; guests respond via a
-- per-invitation token (no auth) to a public RSVP page. Token-only access
-- runs through SECURITY DEFINER RPCs so we don't have to write
-- header-aware RLS.

create table public.event_guests (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  plus_one_allowed boolean not null default false,
  group_label text,
  invitation_token text unique not null default encode(gen_random_bytes(16), 'hex'),
  rsvp_status text check (rsvp_status in ('attending','declined','maybe')),
  rsvp_plus_one boolean,
  rsvp_dietary text,
  rsvp_message text,
  rsvp_responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_guests_host_idx
  on public.event_guests (host_id, created_at desc);

alter table public.event_guests enable row level security;

create policy "event_guests host all"
  on public.event_guests
  for all to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create trigger event_guests_updated
  before update on public.event_guests
  for each row execute function public.tg_set_updated_at();

-- Public RSVP lookup: token → guest + host + event details. No auth needed.
create or replace function public.get_guest_by_token(p_token text)
returns table (
  id uuid,
  name text,
  plus_one_allowed boolean,
  rsvp_status text,
  rsvp_plus_one boolean,
  rsvp_dietary text,
  rsvp_message text,
  host_name text,
  event_type text,
  event_date date,
  event_location text
)
language sql stable security definer set search_path = public
as $$
  select
    g.id,
    g.name,
    g.plus_one_allowed,
    g.rsvp_status,
    g.rsvp_plus_one,
    g.rsvp_dietary,
    g.rsvp_message,
    p.display_name as host_name,
    p.event_type,
    p.event_date,
    p.event_location
  from public.event_guests g
  join public.profiles p on p.id = g.host_id
  where g.invitation_token = p_token
$$;

grant execute on function public.get_guest_by_token(text) to anon, authenticated;

-- Public RSVP submit: token → write the response row. No auth needed.
create or replace function public.submit_rsvp(
  p_token text,
  p_status text,
  p_plus_one boolean,
  p_dietary text,
  p_message text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_status not in ('attending','declined','maybe') then
    raise exception 'Invalid status';
  end if;
  update public.event_guests
    set rsvp_status = p_status,
        rsvp_plus_one = p_plus_one,
        rsvp_dietary = nullif(trim(p_dietary), ''),
        rsvp_message = nullif(trim(p_message), ''),
        rsvp_responded_at = now()
    where invitation_token = p_token;
  if not found then
    raise exception 'Invitation not found';
  end if;
end$$;

grant execute on function public.submit_rsvp(text, text, boolean, text, text) to anon, authenticated;
