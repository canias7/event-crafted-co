-- Homepage A/B/C test, round two: the main measure is completed
-- registrations, taken from the accounts themselves.
--
-- New events from the website (home_experiment_events):
--   visit         the visitor got a version (once per visitor)
--   signup_start  opened a sign-up form (detail: host / vendor)
-- A completed registration is an account whose sign-up saved the visitor's
-- version in its user metadata ("home_test": experiment, variant,
-- visitor_id), only for visitors who accepted analytics cookies. Vendor or
-- host comes from profiles.role, as everywhere else.

alter table public.home_experiment_events
  drop constraint if exists home_experiment_events_event;
alter table public.home_experiment_events
  add constraint home_experiment_events_event
  check (event in ('visit', 'view', 'click', 'select', 'signup_start', 'signup'));

-- The summary's columns change, so it is dropped and created again.
drop function if exists public.home_experiment_summary(text, timestamptz);

-- Per version, over the visitors who first got it in the period (all time
-- when p_since is null), what they went on to do at any time since:
--   visitors               got this version
--   section_viewers        scrolled down to the section
--   interactions           category, event-type and link clicks in it (not
--                          the main button); interactors = people
--   cta_clicks             main button clicks; cta_clickers = people
--   registration_starters  opened a sign-up form
--   registrations          accounts created after getting the version,
--                          split into vendor_registrations and
--                          host_registrations
-- Empty for non-admins.
create function public.home_experiment_summary(
  p_experiment text default 'home_section_v1',
  p_since timestamptz default null
)
returns table (
  variant text,
  visitors bigint,
  section_viewers bigint,
  interactions bigint,
  interactors bigint,
  cta_clicks bigint,
  cta_clickers bigint,
  registration_starters bigint,
  registrations bigint,
  vendor_registrations bigint,
  host_registrations bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select e.visitor_id, e.variant, e.event, e.detail, e.created_at
    from public.home_experiment_events e
    where public.is_admin()
      and e.experiment = p_experiment
  ),
  -- Every visitor with a version; first_seen = their earliest event.
  cohort as (
    select visitor_id, min(variant) as variant, min(created_at) as first_seen
    from ev
    group by visitor_id
    having p_since is null or min(created_at) >= p_since
  ),
  actions as (
    select
      c.visitor_id,
      bool_or(e.event = 'view') as viewed,
      count(*) filter (
        where e.event in ('click', 'select') and e.detail is distinct from 'cta'
      ) as interactions,
      count(*) filter (where e.event = 'click' and e.detail = 'cta') as cta_clicks,
      bool_or(e.event = 'signup_start') as started
    from cohort c
    join ev e on e.visitor_id = c.visitor_id
    group by c.visitor_id
  ),
  accounts as (
    select
      c.visitor_id,
      count(*) as registrations,
      count(*) filter (where p.role = 'vendor') as vendors,
      count(*) filter (where p.role is distinct from 'vendor') as hosts
    from cohort c
    join auth.users u
      on u.raw_user_meta_data -> 'home_test' ->> 'experiment' = p_experiment
     and u.raw_user_meta_data -> 'home_test' ->> 'visitor_id' = c.visitor_id::text
     and u.created_at >= c.first_seen
    left join public.profiles p on p.id = u.id
    group by c.visitor_id
  )
  select
    c.variant,
    count(*) as visitors,
    count(*) filter (where a.viewed) as section_viewers,
    coalesce(sum(a.interactions), 0)::bigint as interactions,
    count(*) filter (where a.interactions > 0) as interactors,
    coalesce(sum(a.cta_clicks), 0)::bigint as cta_clicks,
    count(*) filter (where a.cta_clicks > 0) as cta_clickers,
    count(*) filter (where a.started) as registration_starters,
    coalesce(sum(r.registrations), 0)::bigint as registrations,
    coalesce(sum(r.vendors), 0)::bigint as vendor_registrations,
    coalesce(sum(r.hosts), 0)::bigint as host_registrations
  from cohort c
  join actions a on a.visitor_id = c.visitor_id
  left join accounts r on r.visitor_id = c.visitor_id
  group by c.variant
  order by c.variant;
$$;

-- Signed-in callers only (it returns nothing unless the caller is an admin).
revoke all on function public.home_experiment_summary(text, timestamptz) from public, anon;
grant execute on function public.home_experiment_summary(text, timestamptz) to authenticated;
