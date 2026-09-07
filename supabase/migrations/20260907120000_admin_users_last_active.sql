-- Real activity signal for the admin Users table, replacing last_sign_in_at
-- as the headline number.
--
-- The page rendered last_sign_in_at, which is the wrong column: sessions
-- persist in SecureStore with autoRefreshToken, so a user who opens the app
-- daily still shows the sign-in from whenever they first logged in. On this
-- project it understated one account's activity by seventy days.
--
-- Two traps this has to avoid, both found while building it:
--
-- 1. Last-active is the LATER of the two signals, not one instead of the
--    other. auth.sessions rows are deleted on sign-out and cleaned up when
--    they expire, so "no session row" does not mean "never opened" — it
--    usually means the user signed out. Reading refreshed_at alone labelled
--    five of fourteen accounts "Never opened", two of whom had signed in the
--    day before. GREATEST ignores NULLs in Postgres and returns NULL only
--    when every argument is NULL, which is exactly the semantics wanted.
--
-- 2. auth.sessions.refreshed_at is `timestamp WITHOUT time zone`, while
--    last_sign_in_at and now() are timestamptz. Comparing them directly makes
--    Postgres coerce the naked timestamp using the connection's TimeZone —
--    correct only as long as that happens to be UTC. GoTrue writes UTC, so
--    the conversion is stated rather than left to a session setting.
--
-- Still a proxy, not a truth: a background refresh can fire without a human
-- present. A last_seen_at written by the app on foreground would supersede it.

drop view if exists public.user_last_active;

create view public.user_last_active
with (security_invoker = off) as
select
  u.id         as user_id,
  u.email      as email,
  p.role       as role,
  u.created_at as signed_up_at,
  greatest(max(s.refreshed_at) at time zone 'utc', u.last_sign_in_at) as last_active_at,
  case
    when greatest(max(s.refreshed_at) at time zone 'utc', u.last_sign_in_at) is null then null
    else (extract(epoch from (now() - greatest(max(s.refreshed_at) at time zone 'utc', u.last_sign_in_at))) / 86400)::int
  end          as days_since_active
from auth.users u
left join auth.sessions s on s.user_id = u.id
left join public.profiles p on p.id = u.id
group by u.id, u.email, p.role, u.created_at, u.last_sign_in_at;

comment on view public.user_last_active is
  'Per-user last-active: later of auth.sessions.refreshed_at and last_sign_in_at. Service role only.';

revoke all on public.user_last_active from public, anon, authenticated;
grant select on public.user_last_active to service_role;

create or replace function public.admin_list_users()
returns table(
  id uuid,
  email text,
  display_name text,
  role text,
  application_status text,
  suspended_at timestamp with time zone,
  created_at timestamp with time zone,
  last_sign_in_at timestamp with time zone,
  last_active_at timestamp with time zone,
  days_since_active integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select
      p.id,
      u.email::text,
      p.display_name,
      p.role::text,
      p.application_status::text,
      p.suspended_at,
      u.created_at,
      u.last_sign_in_at,
      act.last_active_at,
      case
        when act.last_active_at is null then null
        else (extract(epoch from (now() - act.last_active_at)) / 86400)::int
      end as days_since_active
    from public.profiles p
    join auth.users u on u.id = p.id
    left join lateral (
      select greatest(max(s.refreshed_at) at time zone 'utc', u.last_sign_in_at) as last_active_at
      from auth.sessions s
      where s.user_id = p.id
    ) act on true
    order by u.created_at desc
    limit 500;
end;
$function$;

-- is_admin() is the real gate, but anon can never satisfy it, so there is no
-- reason for anon or PUBLIC to hold EXECUTE on an admin-only function.
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated, service_role;
