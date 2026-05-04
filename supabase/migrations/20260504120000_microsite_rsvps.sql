-- Microsite RSVPs: extends the existing event microsite (the public
-- /e/:token page) with a real RSVP form so guests can respond
-- without needing an account. Replaces the current "check your
-- invitation" placeholder.
--
-- Design: anyone holding the microsite token can submit one RSVP per
-- email (upserts on duplicate so they can update their response).
-- Hosts see the responses on their dashboard. Optional custom
-- questions are stored as a free-form jsonb on the host_events row,
-- and answers come back in the same shape.

-- 1. Optional RSVP config columns on host_events.
alter table public.host_events
  add column if not exists microsite_rsvp_deadline timestamptz,
  add column if not exists microsite_rsvp_questions jsonb not null default '[]'::jsonb,
  add column if not exists microsite_rsvp_intro text;

-- 2. The RSVP table.
create table if not exists public.event_microsite_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.host_events(id) on delete cascade,
  guest_name text not null,
  guest_email text not null,
  attending boolean not null,
  plus_ones integer not null default 0 check (plus_ones >= 0 and plus_ones <= 20),
  message text,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, guest_email)
);

create index event_microsite_rsvps_event_idx
  on public.event_microsite_rsvps (event_id, created_at desc);

alter table public.event_microsite_rsvps enable row level security;

-- Host can read all RSVPs on their own event.
create policy "rsvps host select"
  on public.event_microsite_rsvps for select
  to authenticated
  using (
    exists (
      select 1 from public.host_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

-- Host can delete (e.g. spam removal).
create policy "rsvps host delete"
  on public.event_microsite_rsvps for delete
  to authenticated
  using (
    exists (
      select 1 from public.host_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

-- No public direct INSERT — the RPC handles that with token validation.

-- 3. Public RPC: submit/update an RSVP via the microsite token.
-- Returns the row id on success, raises on bad token / closed RSVP.
create or replace function public.submit_microsite_rsvp(
  p_token text,
  p_name text,
  p_email text,
  p_attending boolean,
  p_plus_ones integer default 0,
  p_message text default null,
  p_answers jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_event_id uuid;
  v_show boolean;
  v_deadline timestamptz;
  v_id uuid;
begin
  -- Validate inputs early.
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required';
  end if;
  if coalesce(trim(p_email), '') = '' or position('@' in p_email) = 0 then
    raise exception 'valid email required';
  end if;
  if p_plus_ones < 0 or p_plus_ones > 20 then
    raise exception 'plus_ones out of range';
  end if;

  -- Resolve event from token + check it's published and accepting.
  select id, microsite_show_rsvp, microsite_rsvp_deadline
    into v_event_id, v_show, v_deadline
    from public.host_events
    where microsite_token = p_token
      and microsite_published_at is not null
      and archived_at is null;

  if v_event_id is null then
    raise exception 'event not found';
  end if;
  if not v_show then
    raise exception 'rsvp closed';
  end if;
  if v_deadline is not null and v_deadline < now() then
    raise exception 'rsvp deadline passed';
  end if;

  -- Upsert: same email = update existing response.
  insert into public.event_microsite_rsvps (
    event_id, guest_name, guest_email, attending, plus_ones, message, answers
  ) values (
    v_event_id, trim(p_name), lower(trim(p_email)), p_attending,
    p_plus_ones, nullif(trim(coalesce(p_message, '')), ''), p_answers
  )
  on conflict (event_id, guest_email) do update set
    guest_name = excluded.guest_name,
    attending = excluded.attending,
    plus_ones = excluded.plus_ones,
    message = excluded.message,
    answers = excluded.answers,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_microsite_rsvp(
  text, text, text, boolean, integer, text, jsonb
) to anon, authenticated;

-- 4. Extend the existing get_microsite_by_token RPC to expose the
-- RSVP config (deadline, intro, custom questions) on the response.
-- Done as a small wrapper RPC instead of editing the existing one to
-- keep migrations forward-only and the diff small.
create or replace function public.get_microsite_rsvp_config(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
stable
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'deadline', microsite_rsvp_deadline,
    'intro', microsite_rsvp_intro,
    'questions', coalesce(microsite_rsvp_questions, '[]'::jsonb),
    'show', microsite_show_rsvp
  )
  into v
  from public.host_events
  where microsite_token = p_token
    and microsite_published_at is not null
    and archived_at is null;

  return v;
end;
$$;

grant execute on function public.get_microsite_rsvp_config(text) to anon, authenticated;
