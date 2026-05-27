-- Per-vendor My Space preferences. Free-form text the vendor sets
-- once ("always sign as Jamie", "reply formally", "prefer Friday
-- meetings"); the chat edge function injects it into the system
-- prompt on every turn.
alter table public.vendor_profiles
  add column if not exists my_space_preferences text;

-- Audit log for every WRITE action the AI executes on the vendor's
-- behalf. Separate from ai_call_usage (which is for cost
-- accounting) — this carries the full input + result so the vendor
-- can audit what happened.
create table if not exists public.my_space_action_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid references public.vendor_profiles(id) on delete cascade,
  thread_id uuid references public.my_space_threads(id) on delete set null,
  tool_name text not null,
  input jsonb,
  result jsonb,
  success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists my_space_action_audit_user_created_idx
  on public.my_space_action_audit (user_id, created_at desc);

alter table public.my_space_action_audit enable row level security;

create policy "my_space_action_audit_owner_select"
  on public.my_space_action_audit
  for select
  using (user_id = auth.uid());
