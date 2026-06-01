-- M4: Server-side rate limiting for public, unauthenticated payment endpoints.
--
-- The public pay-link / invoice checkout + intent endpoints make a live
-- Stripe accounts.retrieve and create Checkout Sessions / PaymentIntents on
-- every request. With no rate limiting, harvested/guessed slugs let an
-- attacker drive Stripe rate-limit exhaustion / cost / PaymentIntent spam.
--
-- This adds a fixed-window counter table + an atomic SECURITY DEFINER bump
-- function the edge functions call (service-role only) before touching Stripe.

create table if not exists public.rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (bucket, window_start)
);

-- Service-role only: enable RLS with NO policy so anon/authenticated callers
-- cannot read or write the counters directly (matches the locked-down
-- side-table pattern used elsewhere in this codebase). The bump function
-- below is SECURITY DEFINER, so it bypasses RLS for the controlled increment.
alter table public.rate_limits enable row level security;

-- Atomic fixed-window limiter. Computes the current window start by flooring
-- now() to the window size, upserts the row incrementing hits, and returns
-- TRUE when the post-increment hit count is still within _max (allowed),
-- FALSE when over the limit.
create or replace function public.bump_rate_limit(
  _bucket text,
  _max int,
  _window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _window_start timestamptz;
  _hits int;
begin
  -- Floor now() to the start of the current fixed window.
  _window_start := to_timestamp(
    floor(extract(epoch from now()) / _window_seconds) * _window_seconds
  );

  insert into public.rate_limits (bucket, window_start, hits)
  values (_bucket, _window_start, 1)
  on conflict (bucket, window_start)
  do update set hits = rate_limits.hits + 1
  returning hits into _hits;

  return _hits <= _max;
end;
$$;

grant execute on function public.bump_rate_limit(text, int, int) to service_role;
grant execute on function public.bump_rate_limit(text, int, int) to authenticated;
