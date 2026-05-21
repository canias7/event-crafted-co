-- MCP tool-call audit log. Every tool/call landing in vendora-mcp
-- writes a row here so the vendor can see what Claude has been
-- doing on their behalf. RLS-gated to the owner.

create table public.mcp_call_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text,
  auth_method text not null check (auth_method in ('oauth', 'pat')),
  tool_name text not null,
  args jsonb,
  ok boolean not null,
  error text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index mcp_call_log_user_idx
  on public.mcp_call_log (user_id, created_at desc);

alter table public.mcp_call_log enable row level security;

create policy "mcp_call_log select own"
  on public.mcp_call_log for select to authenticated
  using (user_id = auth.uid());

create policy "mcp_call_log delete own"
  on public.mcp_call_log for delete to authenticated
  using (user_id = auth.uid());
