-- Per-vendor saved invoice template. Lets vendors customize the
-- blank invoice shell once and reuse it as the starting point for
-- future invoices instead of repeating the same line items, notes,
-- and tax rate every time.
--
-- Stored as JSONB so the shape can evolve with the composer (today:
-- lineItems + notes + taxPct; later: projectTitle, paymentTerms,
-- per-line description, etc) without a migration each time.
--
-- Separate table (not a column on vendor_profiles) so the data stays
-- private — vendor_profiles has a "public read" policy that would
-- otherwise expose the saved template to anyone with the listing id.

create table if not exists public.vendor_invoice_defaults (
  vendor_id uuid primary key references public.vendor_profiles(id) on delete cascade,
  template_data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.vendor_invoice_defaults enable row level security;

drop policy if exists "vendor_invoice_defaults owner read" on public.vendor_invoice_defaults;
create policy "vendor_invoice_defaults owner read" on public.vendor_invoice_defaults
  for select
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_invoice_defaults.vendor_id
        and vp.user_id = auth.uid()
    )
  );

drop policy if exists "vendor_invoice_defaults owner write" on public.vendor_invoice_defaults;
create policy "vendor_invoice_defaults owner write" on public.vendor_invoice_defaults
  for all
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_invoice_defaults.vendor_id
        and vp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_invoice_defaults.vendor_id
        and vp.user_id = auth.uid()
    )
  );

create or replace function public.vendor_invoice_defaults_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vendor_invoice_defaults_touch_trg on public.vendor_invoice_defaults;
create trigger vendor_invoice_defaults_touch_trg
  before update on public.vendor_invoice_defaults
  for each row execute function public.vendor_invoice_defaults_touch();
