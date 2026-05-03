-- Sample contracts library: vendors save contract templates (markdown
-- or plain text), and optionally attach one to a proposal so the host
-- sees the terms before they accept. Stops short of e-signing — that's
-- a separate integration.
--
-- Two pieces:
--   vendor_contract_templates  — vendor-side library
--   proposals.contract_body    — the snapshot of the contract attached
--                                to a specific proposal at send time
--                                (frozen so editing the template later
--                                doesn't mutate accepted proposals)

create table public.vendor_contract_templates (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  name text not null,
  body text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendor_contract_templates_vendor_idx
  on public.vendor_contract_templates (vendor_id, name);

-- Only one default per vendor — partial unique index so flipping the
-- default is "set the new one, the old auto-undefaults via UI logic"
-- without needing a transaction.
create unique index vendor_contract_templates_one_default
  on public.vendor_contract_templates (vendor_id)
  where is_default = true;

alter table public.vendor_contract_templates enable row level security;

create policy "vendor_contract_templates member select"
  on public.vendor_contract_templates for select to authenticated
  using (public.is_vendor_member(vendor_id));

create policy "vendor_contract_templates member insert"
  on public.vendor_contract_templates for insert to authenticated
  with check (public.is_vendor_member(vendor_id));

create policy "vendor_contract_templates member update"
  on public.vendor_contract_templates for update to authenticated
  using (public.is_vendor_member(vendor_id));

create policy "vendor_contract_templates member delete"
  on public.vendor_contract_templates for delete to authenticated
  using (public.is_vendor_member(vendor_id));

create trigger vendor_contract_templates_updated
  before update on public.vendor_contract_templates
  for each row execute function public.tg_set_updated_at();

-- Frozen snapshot on the proposal itself so changes to the template
-- don't retroactively alter what the host accepted.
alter table public.proposals
  add column if not exists contract_body text,
  add column if not exists contract_template_id uuid
    references public.vendor_contract_templates(id) on delete set null;
