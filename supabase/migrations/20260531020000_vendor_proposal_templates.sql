-- Multi-template store for proposals, mirroring vendor_contract_templates
-- so the Proposals tab can hold a named list (like invoices), not just the
-- single template that vendor_document_defaults stored.
create table if not exists public.vendor_proposal_templates (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  name text not null,
  body text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_proposal_templates_vendor_idx
  on public.vendor_proposal_templates (vendor_id);

alter table public.vendor_proposal_templates enable row level security;

-- Mirror vendor_contract_templates RLS exactly: account members only.
create policy "vendor_proposal_templates member select"
  on public.vendor_proposal_templates for select
  using (is_vendor_member(vendor_id));
create policy "vendor_proposal_templates member insert"
  on public.vendor_proposal_templates for insert
  with check (is_vendor_member(vendor_id));
create policy "vendor_proposal_templates member update"
  on public.vendor_proposal_templates for update
  using (is_vendor_member(vendor_id));
create policy "vendor_proposal_templates member delete"
  on public.vendor_proposal_templates for delete
  using (is_vendor_member(vendor_id));
