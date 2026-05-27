-- My Space knowledge base — persistent vendor facts the AI uses on
-- every turn. Pricing rules, services, brand voice, FAQs, policies.
-- The chat edge function loads active entries per-request and injects
-- them into the system prompt grouped by category, and exposes
-- add/update/delete tools so the AI can manage entries when the
-- vendor says "remember that…" or "from now on…".

create table if not exists public.my_space_knowledge (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid references public.vendor_profiles(id) on delete cascade,
  category text not null check (
    category in ('pricing', 'services', 'brand_voice', 'faq', 'policies', 'other')
  ),
  title text not null check (length(title) between 1 and 200),
  content text not null check (length(content) between 1 and 4000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists my_space_knowledge_user_active_idx
  on public.my_space_knowledge (user_id, is_active);

create index if not exists my_space_knowledge_vendor_active_idx
  on public.my_space_knowledge (vendor_id, is_active);

alter table public.my_space_knowledge enable row level security;

create policy "my_space_knowledge_owner_select"
  on public.my_space_knowledge
  for select
  using (user_id = auth.uid());

create policy "my_space_knowledge_owner_modify"
  on public.my_space_knowledge
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.set_my_space_knowledge_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_my_space_knowledge_updated_at_trg on public.my_space_knowledge;
create trigger set_my_space_knowledge_updated_at_trg
  before update on public.my_space_knowledge
  for each row
  execute function public.set_my_space_knowledge_updated_at();
