-- Calendar feed token: each user gets a long-lived random token used in
-- a webcal:// URL so Google Calendar / Apple Calendar can subscribe and
-- auto-sync appointments + event-day timeline.
--
-- The token is the auth — anyone with the URL can fetch the calendar
-- (same trust model as a Google Calendar share link). Users can rotate
-- it from settings if it leaks.

alter table public.profiles
  add column if not exists calendar_feed_token text unique;

-- Backfill: generate one for every existing user. Trigger keeps it
-- populated for new users.
update public.profiles
set calendar_feed_token = replace(gen_random_uuid()::text, '-', '')
where calendar_feed_token is null;

create or replace function public.tg_set_calendar_feed_token()
returns trigger
language plpgsql
as $$
begin
  if new.calendar_feed_token is null then
    new.calendar_feed_token := replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end$$;

drop trigger if exists profiles_calendar_feed_token on public.profiles;
create trigger profiles_calendar_feed_token
  before insert on public.profiles
  for each row execute function public.tg_set_calendar_feed_token();

-- SECURITY DEFINER lookup: returns the calendar payload for a token
-- (appointments + event-day timeline items) so the edge function can
-- emit an .ics without going through RLS for each row.
create or replace function public.get_calendar_feed_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_appointments jsonb;
  v_timeline jsonb;
  v_active_event_date date;
begin
  select id into v_user
  from public.profiles
  where calendar_feed_token = p_token;

  if v_user is null then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'kind', a.kind,
      'scheduled_at', a.scheduled_at,
      'duration_minutes', a.duration_minutes,
      'location', a.location,
      'notes', a.notes,
      'status', a.status,
      'vendor_name', vp.business_name
    ) order by a.scheduled_at
  ), '[]'::jsonb)
  into v_appointments
  from public.appointments a
  left join public.vendor_profiles vp on vp.id = a.vendor_id
  where a.host_id = v_user
    and a.status in ('proposed', 'accepted');

  -- Timeline items use the active event's date as the anchor.
  select he.event_date into v_active_event_date
  from public.profiles p
  left join public.host_events he on he.id = p.active_event_id
  where p.id = v_user;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'title', t.title,
      'start_time', t.start_time,
      'duration_minutes', t.duration_minutes,
      'location', t.location,
      'notes', t.notes,
      'event_date', v_active_event_date
    ) order by t.start_time
  ), '[]'::jsonb)
  into v_timeline
  from public.event_timeline_items t
  where t.host_id = v_user
    -- Only include timeline items if we know the event date — otherwise
    -- they'd float without a calendar anchor.
    and v_active_event_date is not null;

  return jsonb_build_object(
    'appointments', v_appointments,
    'timeline', v_timeline
  );
end$$;

grant execute on function public.get_calendar_feed_by_token(text)
  to anon, authenticated;
