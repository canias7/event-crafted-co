-- Custom webhook tools the vendor defines themselves. The chat
-- function loads these per-request and adds them to the AI's tool
-- list. When the AI invokes one, the chat function POSTs the
-- tool's args to the registered URL and returns the response.

create table if not exists public.my_space_custom_tools (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid references public.vendor_profiles(id) on delete cascade,
  name text not null,
  description text not null,
  url text not null,
  method text not null default 'POST' check (method in ('GET','POST','PUT','PATCH','DELETE')),
  headers_json jsonb,
  input_schema jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, name)
);

create index if not exists my_space_custom_tools_vendor_idx
  on public.my_space_custom_tools (vendor_id, is_active);

alter table public.my_space_custom_tools enable row level security;

create policy "my_space_custom_tools_owner_select"
  on public.my_space_custom_tools
  for select
  using (user_id = auth.uid());

create policy "my_space_custom_tools_owner_modify"
  on public.my_space_custom_tools
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
