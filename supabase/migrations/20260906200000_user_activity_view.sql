-- Last-active signal for the dormant-user scanner.
--
-- There is no last_seen_at on profiles, and auth.users.last_sign_in_at is
-- the wrong column: sessions persist in SecureStore with autoRefreshToken,
-- so someone who has opened the app every day since June still shows a
-- sign-in from June. Using it would target the most active users.
--
-- auth.sessions.refreshed_at does move, because the client refreshes its
-- token while the app is foregrounded. It is a proxy, not a truth: a
-- background refresh can fire without a human present, and a user offline
-- for a while looks quieter than they are. Good enough to pick an email
-- audience; not good enough to report as "opens". A real last_seen_at
-- written by the app on foreground would supersede this.
--
-- PostgREST cannot read the auth schema, hence a definer view in public.
-- Service role only: this exposes email addresses next to activity, which
-- is exactly the join an anon caller should never have.

create or replace view public.user_last_active
with (security_invoker = off) as
select
  u.id                                   as user_id,
  u.email                                as email,
  p.role                                 as role,
  u.created_at                           as signed_up_at,
  max(s.refreshed_at)                    as last_active_at,
  case
    when max(s.refreshed_at) is null then null
    else (extract(epoch from (now() - max(s.refreshed_at))) / 86400)::int
  end                                    as days_since_active
from auth.users u
left join auth.sessions s on s.user_id = u.id
left join public.profiles p on p.id = u.id
group by u.id, u.email, p.role, u.created_at;

comment on view public.user_last_active is
  'Per-user last-active proxy from auth.sessions.refreshed_at. Service role only — joins email to activity.';

-- The view is SECURITY DEFINER by construction (security_invoker = off),
-- so grants are the entire access control story. Nobody but the service
-- role gets to read it.
revoke all on public.user_last_active from public, anon, authenticated;
grant select on public.user_last_active to service_role;
