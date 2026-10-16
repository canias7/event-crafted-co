-- Invitation design (owner's call, Oct 2026): the host picks the colours,
-- the lettering, the decoration and a frame, or a ready-made design for the
-- occasion. One jsonb object, read by the website and the host app
-- (apps/web/src/lib/inviteDesign.ts): { palette, bg?, accent?, font,
-- ornament, frame }. Unknown values fall back to defaults in the apps, so
-- new choices need no database change.

alter table public.host_events
  add column if not exists invite_design jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.host_events add constraint host_events_invite_design_check
    check (jsonb_typeof(invite_design) = 'object' and length(invite_design::text) <= 2000);
exception when duplicate_object then null; end $$;

-- The public RSVP page now also gets the design.
create or replace function public.get_event_by_share_token(p_token text)
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
    'invite_design', e.invite_design,
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
