-- Per-vendor saved template for long-form documents (contracts,
-- proposals). Mirrors vendor_invoice_defaults but with a `kind`
-- column so a single row per (vendor, kind) stores the editable
-- title + body the vendor keeps reusing.
--
-- Stored as JSONB so the shape can grow (e.g. add sections, attached
-- files) without further migrations.

create table if not exists public.vendor_document_defaults (
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  kind text not null check (kind in ('contract', 'proposal')),
  template_data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (vendor_id, kind)
);

alter table public.vendor_document_defaults enable row level security;

drop policy if exists "vendor_document_defaults owner read" on public.vendor_document_defaults;
create policy "vendor_document_defaults owner read" on public.vendor_document_defaults
  for select
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_document_defaults.vendor_id
        and vp.user_id = auth.uid()
    )
  );

drop policy if exists "vendor_document_defaults owner write" on public.vendor_document_defaults;
create policy "vendor_document_defaults owner write" on public.vendor_document_defaults
  for all
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_document_defaults.vendor_id
        and vp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_document_defaults.vendor_id
        and vp.user_id = auth.uid()
    )
  );

create or replace function public.vendor_document_defaults_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vendor_document_defaults_touch_trg on public.vendor_document_defaults;
create trigger vendor_document_defaults_touch_trg
  before update on public.vendor_document_defaults
  for each row execute function public.vendor_document_defaults_touch();
