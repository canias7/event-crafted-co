-- Server-side confirmation gate for My Space's sensitive tools
-- (send_host_reply, bulk_send_reply, send_email, create_payment_link,
-- create_invoice). The first time the model calls one of these, the
-- chat records a pending row keyed by the exact action and the current
-- turn id, and returns "confirmation_required" instead of executing.
-- It only executes on a LATER turn (different turn id) when the model
-- re-calls with identical args — i.e. after the vendor has actually
-- replied. This makes a single-turn injection unable to send.
create table if not exists public.my_space_pending_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid,
  tool_name text not null,
  args_hash text not null,
  turn_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, thread_id, tool_name, args_hash)
);
alter table public.my_space_pending_confirmations enable row level security;
create index if not exists my_space_pending_confirmations_created_idx
  on public.my_space_pending_confirmations (created_at);
