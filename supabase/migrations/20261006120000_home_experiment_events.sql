-- Homepage A/B/C test (the section under the hero comes in three versions).
-- One row per thing a visitor does with that section: saw it, clicked
-- something in it, picked an event type (version B), or signed up later.
-- Visitors are anonymous (a random id kept in their browser) and rows are
-- only sent when they accepted analytics cookies. Admins read the totals
-- through home_experiment_summary() / home_experiment_clicks().

create table if not exists public.home_experiment_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  experiment text not null,
  variant text not null,
  visitor_id uuid not null,
  event text not null,
  detail text,
  lang text,
  constraint home_experiment_events_experiment_len check (char_length(experiment) between 1 and 40),
  constraint home_experiment_events_variant check (variant in ('a', 'b', 'c')),
  constraint home_experiment_events_event check (event in ('view', 'click', 'select', 'signup')),
  constraint home_experiment_events_detail_len check (detail is null or char_length(detail) <= 80),
  constraint home_experiment_events_lang_len check (lang is null or char_length(lang) <= 8)
);

create index if not exists home_experiment_events_experiment_idx
  on public.home_experiment_events (experiment, variant, event);

alter table public.home_experiment_events enable row level security;

-- Anyone, signed in or not, can record an event (the checks above bound
-- what a row can hold), like vendor_profile_views.
drop policy if exists "home_experiment_events public insert" on public.home_experiment_events;
create policy "home_experiment_events public insert"
  on public.home_experiment_events for insert
  to anon, authenticated
  with check (true);

-- Only admins can read the rows.
drop policy if exists "home_experiment_events admin select" on public.home_experiment_events;
create policy "home_experiment_events admin select"
  on public.home_experiment_events for select
  to authenticated
  using (public.is_admin());

-- Per version: visitors who saw the section, who clicked anything in it,
-- total clicks, and visitors who signed up after seeing it (a sign-up
-- without a view, e.g. after only a ?home= preview, isn't counted).
-- Empty for non-admins.
create or replace function public.home_experiment_summary(
  p_experiment text default 'home_section_v1',
  p_since timestamptz default null
)
returns table (
  variant text,
  visitors bigint,
  viewers bigint,
  clickers bigint,
  clicks bigint,
  signups bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select *
    from public.home_experiment_events e
    where public.is_admin()
      and e.experiment = p_experiment
      and (p_since is null or e.created_at >= p_since)
  ),
  first_view as (
    select visitor_id, min(created_at) as seen_at
    from ev
    where event = 'view'
    group by visitor_id
  )
  select
    e.variant,
    count(distinct e.visitor_id) as visitors,
    count(distinct e.visitor_id) filter (where e.event = 'view') as viewers,
    count(distinct e.visitor_id) filter (where e.event = 'click') as clickers,
    count(*) filter (where e.event = 'click') as clicks,
    count(distinct e.visitor_id) filter (
      where e.event = 'signup' and v.seen_at <= e.created_at
    ) as signups
  from ev e
  left join first_view v on v.visitor_id = e.visitor_id
  group by e.variant
  order by e.variant;
$$;

-- What people clicked or picked, per version (tile, event type, button).
create or replace function public.home_experiment_clicks(
  p_experiment text default 'home_section_v1',
  p_since timestamptz default null
)
returns table (
  variant text,
  event text,
  detail text,
  total bigint,
  visitors bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.variant,
    e.event,
    coalesce(e.detail, '') as detail,
    count(*) as total,
    count(distinct e.visitor_id) as visitors
  from public.home_experiment_events e
  where public.is_admin()
    and e.experiment = p_experiment
    and e.event in ('click', 'select')
    and (p_since is null or e.created_at >= p_since)
  group by e.variant, e.event, coalesce(e.detail, '')
  order by e.variant, total desc;
$$;

-- Signed-in callers only (they return nothing unless the caller is an admin).
revoke all on function public.home_experiment_summary(text, timestamptz) from public, anon;
revoke all on function public.home_experiment_clicks(text, timestamptz) from public, anon;
grant execute on function public.home_experiment_summary(text, timestamptz) to authenticated;
grant execute on function public.home_experiment_clicks(text, timestamptz) to authenticated;
