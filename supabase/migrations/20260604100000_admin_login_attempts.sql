-- Brute-force throttle for the admin-session edge function. The function
-- records a row per FAILED PIN attempt (keyed by IP) and refuses once an IP
-- exceeds the window threshold. Service-role only: RLS is enabled with no
-- policies, so anon/authenticated clients can't read or write it (the edge
-- function uses the service-role key, which bypasses RLS).
create table if not exists public.admin_login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists admin_login_attempts_ip_time_idx
  on public.admin_login_attempts (ip, attempted_at desc);

alter table public.admin_login_attempts enable row level security;
-- No policies on purpose: only the service role (RLS-exempt) touches this.
