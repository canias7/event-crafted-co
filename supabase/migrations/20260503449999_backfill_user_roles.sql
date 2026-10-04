-- Backfill: public.user_roles exists in production but was created outside
-- migrations, so a from-scratch replay failed at the next migration that
-- references it. Definition copied from production (Oct 2026). No-op there.
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;
