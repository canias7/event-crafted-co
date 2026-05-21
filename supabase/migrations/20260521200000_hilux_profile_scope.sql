-- HILUX moves from per-listing to per-profile. A user has one HILUX
-- across all their listings; the agent still uses each listing's own
-- bio/packages/calendar when chatting, but the configuration
-- (enabled, instructions, voice, per-action toggles) lives on
-- profiles.

alter table public.profiles
  add column if not exists hilux_enabled boolean not null default false;

alter table public.profiles
  add column if not exists hilux_instructions text;

alter table public.profiles
  add column if not exists hilux_voice_samples text[] not null default '{}'::text[];

-- Per-action toggles. Default-on so a vendor who flips HILUX on
-- doesn't lose features they didn't know existed.
alter table public.profiles
  add column if not exists hilux_action_follow_up boolean not null default true;

alter table public.profiles
  add column if not exists hilux_action_match_language boolean not null default true;

alter table public.profiles
  add column if not exists hilux_action_use_calendar boolean not null default true;

alter table public.profiles
  add column if not exists hilux_action_escalate boolean not null default true;

-- One-time data migration: for each user that owns vendor_profiles
-- with HILUX state, carry it up to their profile row.
with src as (
  select
    vp.user_id,
    bool_or(vp.hilux_enabled) as enabled,
    (array_agg(vp.hilux_instructions order by vp.created_at) filter (where vp.hilux_instructions is not null and length(trim(vp.hilux_instructions)) > 0))[1] as instructions,
    coalesce(
      array_remove(
        (select array_agg(distinct s) from (
          select unnest(vp2.hilux_voice_samples) as s
          from public.vendor_profiles vp2
          where vp2.user_id = vp.user_id
        ) t),
        null
      ),
      '{}'::text[]
    ) as samples
  from public.vendor_profiles vp
  where vp.user_id is not null
  group by vp.user_id
)
update public.profiles p
set
  hilux_enabled = src.enabled,
  hilux_instructions = coalesce(p.hilux_instructions, src.instructions),
  hilux_voice_samples = case when array_length(p.hilux_voice_samples, 1) is null then src.samples else p.hilux_voice_samples end
from src
where p.id = src.user_id;
