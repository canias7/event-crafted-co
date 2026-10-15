-- Customizable invitations and RSVPs (owner's call, Oct 2026).
--
-- A host can now style the invitation (cover photo, one of three looks,
-- a welcome message), ask guests more (plus-ones, a meal choice from the
-- host's own options, dietary needs, a song request, up to 5 questions of
-- their own) and set rules (reply-by date, guest limit, whether guests see
-- how many are coming). Guests' answers are stored on their reply.

alter table public.host_events
  add column if not exists invite_style text not null default 'classic',
  add column if not exists invite_cover_url text,
  add column if not exists invite_message text,
  add column if not exists rsvp_deadline date,
  add column if not exists rsvp_guest_limit integer,
  add column if not exists rsvp_show_counts boolean not null default true,
  add column if not exists rsvp_plus_ones_max integer not null default 0,
  add column if not exists rsvp_meal_options text[] not null default '{}',
  add column if not exists rsvp_ask_dietary boolean not null default false,
  add column if not exists rsvp_ask_song boolean not null default false,
  add column if not exists rsvp_questions jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.host_events add constraint host_events_invite_style_check
    check (invite_style in ('classic', 'evening', 'photo'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.host_events add constraint host_events_rsvp_limits_check
    check (
      (rsvp_guest_limit is null or rsvp_guest_limit between 1 and 5000)
      and rsvp_plus_ones_max between 0 and 10
      and cardinality(rsvp_meal_options) <= 8
      and jsonb_typeof(rsvp_questions) = 'array'
      and jsonb_array_length(rsvp_questions) <= 5
      and coalesce(length(invite_message), 0) <= 1000
    );
exception when duplicate_object then null; end $$;

alter table public.host_event_rsvps
  add column if not exists plus_ones integer not null default 0,
  add column if not exists meal_choice text,
  add column if not exists dietary text,
  add column if not exists song_request text,
  add column if not exists answers jsonb not null default '{}'::jsonb;

-- What the public RSVP page reads. Counts are left out when the host
-- hides them; "spots_left" only when there's a guest limit. Going guests
-- count with their plus-ones.
drop function if exists public.get_event_by_share_token(text);
create function public.get_event_by_share_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'event_type', e.event_type,
    'event_date', e.event_date,
    'start_time', e.start_time,
    'end_time', e.end_time,
    'location', e.location,
    'notes', e.notes,
    'invite_style', e.invite_style,
    'invite_cover_url', e.invite_cover_url,
    'invite_message', e.invite_message,
    'rsvp_deadline', e.rsvp_deadline,
    'closed', e.rsvp_deadline is not null and current_date > e.rsvp_deadline,
    'plus_ones_max', e.rsvp_plus_ones_max,
    'meal_options', to_jsonb(e.rsvp_meal_options),
    'ask_dietary', e.rsvp_ask_dietary,
    'ask_song', e.rsvp_ask_song,
    'questions', e.rsvp_questions,
    'show_counts', e.rsvp_show_counts,
    'going_count', case when e.rsvp_show_counts then c.going end,
    'maybe_count', case when e.rsvp_show_counts then c.maybe end,
    'spots_left', case when e.rsvp_guest_limit is not null
      then greatest(e.rsvp_guest_limit - c.attending, 0) end
  )
  from public.host_events e
  cross join lateral (
    select
      count(*) filter (where r.status = 'going')::int as going,
      count(*) filter (where r.status = 'maybe')::int as maybe,
      coalesce(sum(1 + r.plus_ones) filter (where r.status = 'going'), 0)::int as attending
    from public.host_event_rsvps r
    where r.event_id = e.id
  ) c
  where e.share_token = p_token
$$;
grant execute on function public.get_event_by_share_token(text) to anon, authenticated;

drop function if exists public.submit_event_rsvp(text, text, text, text);
create or replace function public.submit_event_rsvp(
  p_token text,
  p_name text,
  p_email text,
  p_status text,
  p_plus_ones integer default 0,
  p_meal_choice text default null,
  p_dietary text default null,
  p_song_request text default null,
  p_answers jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  e public.host_events;
  v_plus integer;
  v_attending integer;
  v_answers jsonb := '{}'::jsonb;
  q jsonb;
  v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required';
  end if;
  if p_status not in ('going', 'maybe', 'not_going') then
    raise exception 'invalid status';
  end if;
  select * into e from public.host_events where share_token = p_token;
  if e.id is null then
    raise exception 'invalid share token';
  end if;
  if e.rsvp_deadline is not null and current_date > e.rsvp_deadline then
    raise exception 'rsvp_closed';
  end if;

  -- Plus-ones only count for "going", within the host's maximum.
  v_plus := case when p_status = 'going'
    then least(greatest(coalesce(p_plus_ones, 0), 0), e.rsvp_plus_ones_max) else 0 end;

  if p_status = 'going' and e.rsvp_guest_limit is not null then
    select coalesce(sum(1 + r.plus_ones), 0) into v_attending
      from public.host_event_rsvps r
      where r.event_id = e.id and r.status = 'going';
    if v_attending + 1 + v_plus > e.rsvp_guest_limit then
      raise exception 'rsvp_full';
    end if;
  end if;

  -- Keep only answers to the host's own questions, trimmed.
  for q in select * from jsonb_array_elements(e.rsvp_questions) loop
    if p_answers ? (q->>'id') and coalesce(trim(p_answers->>(q->>'id')), '') <> '' then
      v_answers := v_answers || jsonb_build_object(q->>'id', left(trim(p_answers->>(q->>'id')), 500));
    end if;
  end loop;

  insert into public.host_event_rsvps
    (event_id, name, email, status, plus_ones, meal_choice, dietary, song_request, answers)
  values (
    e.id,
    left(trim(p_name), 120),
    nullif(trim(coalesce(p_email, '')), ''),
    p_status,
    v_plus,
    case when p_meal_choice = any(e.rsvp_meal_options) then p_meal_choice end,
    case when e.rsvp_ask_dietary then nullif(left(trim(coalesce(p_dietary, '')), 300), '') end,
    case when e.rsvp_ask_song then nullif(left(trim(coalesce(p_song_request, '')), 200), '') end,
    v_answers
  )
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.submit_event_rsvp(text, text, text, text, integer, text, text, text, jsonb) to anon, authenticated;

-- Cover photos: public, written by the host into a folder named after
-- their user id.
insert into storage.buckets (id, name, public)
values ('event-invites', 'event-invites', true)
on conflict (id) do nothing;

drop policy if exists "event invites owner insert" on storage.objects;
create policy "event invites owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-invites' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "event invites owner update" on storage.objects;
create policy "event invites owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-invites' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "event invites owner delete" on storage.objects;
create policy "event invites owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-invites' and (storage.foldername(name))[1] = auth.uid()::text);
