-- Host planning tools: real checklist + budget tracker rows owned per-host.
-- Replaces sampleData on /customer/checklist and /customer/payments.

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text,
  completed boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index checklist_items_host_idx
  on public.checklist_items (host_id, display_order, created_at);

alter table public.checklist_items enable row level security;

create policy "checklist_items host all"
  on public.checklist_items
  for all to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create trigger checklist_items_updated
  before update on public.checklist_items
  for each row execute function public.tg_set_updated_at();

-- Budget line items. Status is computed from amounts; due_date drives
-- "overdue" presentation in the UI. No Stripe — manual tracking only.
create table public.budget_items (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  vendor_id uuid references public.vendor_profiles(id) on delete set null,
  category text,
  description text not null,
  amount_cents integer not null default 0,
  paid_cents integer not null default 0,
  due_date date,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index budget_items_host_idx
  on public.budget_items (host_id, due_date, created_at);

alter table public.budget_items enable row level security;

create policy "budget_items host all"
  on public.budget_items
  for all to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create trigger budget_items_updated
  before update on public.budget_items
  for each row execute function public.tg_set_updated_at();
