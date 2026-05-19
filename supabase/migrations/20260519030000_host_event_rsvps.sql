-- RSVPs on host_events. Hosts share an event via a public token URL;
-- guests fill in a name + optional email + going/maybe/not-going.
-- Anonymous insert is allowed (the share token gates discovery), but
-- only the event owner can read the responses.

alter table public.host_events
  add column if not exists share_token text;

update public.host_events
   set share_token = encode(gen_random_bytes(12), 'hex')
 where share_token is null;

alter table public.host_events
  alter column share_token set not null,
  add constraint host_events_share_token_unique unique (share_token);

create or replace function public.tg_host_events_set_share_token()
returns trigger language plpgsql as $$
begin
  if new.share_token is null then
    new.share_token := encode(gen_random_bytes(12), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists host_events_set_share_token on public.host_events;
create trigger host_events_set_share_token
  before insert on public.host_events
  for each row execute function public.tg_host_events_set_share_token();

create table public.host_event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.host_events(id) on delete cascade,
  name text not null,
  email text,
  status text not null default 'going' check (status in ('going', 'maybe', 'not_going')),
  created_at timestamptz not null default now()
);

create index host_event_rsvps_event_idx
  on public.host_event_rsvps (event_id, status);

alter table public.host_event_rsvps enable row level security;

create policy "host_event_rsvps owner select"
  on public.host_event_rsvps for select to authenticated
  using (
    exists (
      select 1 from public.host_events e
      where e.id = event_id and e.host_id = (select auth.uid())
    )
  );

create policy "host_event_rsvps public insert via rpc"
  on public.host_event_rsvps for insert to anon, authenticated
  with check (true);

create policy "host_event_rsvps owner delete"
  on public.host_event_rsvps for delete to authenticated
  using (
    exists (
      select 1 from public.host_events e
      where e.id = event_id and e.host_id = (select auth.uid())
    )
  );

create or replace function public.get_event_by_share_token(p_token text)
returns table (
  id uuid,
  title text,
  event_type text,
  event_date date,
  start_time time,
  end_time time,
  location text,
  notes text,
  going_count integer,
  maybe_count integer
)
language sql stable security definer set search_path = public
as $$
  select
    e.id, e.title, e.event_type, e.event_date, e.start_time, e.end_time,
    e.location, e.notes,
    (select count(*)::int from public.host_event_rsvps r where r.event_id = e.id and r.status = 'going') as going_count,
    (select count(*)::int from public.host_event_rsvps r where r.event_id = e.id and r.status = 'maybe') as maybe_count
  from public.host_events e
  where e.share_token = p_token
$$;

grant execute on function public.get_event_by_share_token(text) to anon, authenticated;

create or replace function public.submit_event_rsvp(
  p_token text,
  p_name text,
  p_email text,
  p_status text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_event_id uuid;
  v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required';
  end if;
  if p_status not in ('going', 'maybe', 'not_going') then
    raise exception 'invalid status';
  end if;
  select id into v_event_id from public.host_events where share_token = p_token;
  if v_event_id is null then
    raise exception 'invalid share token';
  end if;
  insert into public.host_event_rsvps (event_id, name, email, status)
  values (v_event_id, trim(p_name), nullif(trim(coalesce(p_email, '')), ''), p_status)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.submit_event_rsvp(text, text, text, text) to anon, authenticated;
