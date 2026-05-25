-- VendoraPay invoices. Vendor composes a multi-line invoice
-- (bill-to + line items + tax), sends the URL to the host via
-- vendorapay-invoice-send, the host pays via Stripe Checkout.
--
-- Line items stored as JSONB:
--   [{ name, description, qty, unit_price_cents, total_cents }]
-- Tax is a single % on the subtotal (per-line tax = later polish).

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  slug text not null unique default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  invoice_number text not null,
  bill_to_name text,
  bill_to_email text,
  bill_to_phone text,
  bill_to_address text,
  issue_date date not null default current_date,
  due_date date,
  notes text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal_cents integer not null default 0,
  tax_rate_bps integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0 check (total_cents >= 0),
  currency text not null default 'usd',
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'cancelled', 'overdue')),
  sent_at timestamptz,
  paid_at timestamptz,
  paid_payment_intent_id text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_vendor_created_idx
  on public.invoices(vendor_id, created_at desc);
create index if not exists invoices_slug_idx on public.invoices(slug);
create index if not exists invoices_status_due_idx
  on public.invoices(due_date) where status in ('sent', 'overdue');
create unique index if not exists invoices_vendor_number_uniq
  on public.invoices(vendor_id, invoice_number);

alter table public.invoices enable row level security;

drop policy if exists "invoices team read" on public.invoices;
create policy "invoices team read"
  on public.invoices for select
  using (public.is_vendor_member(vendor_id));

drop policy if exists "invoices admin insert" on public.invoices;
create policy "invoices admin insert"
  on public.invoices for insert
  with check (public.is_vendor_team_admin(vendor_id) and created_by = auth.uid());

drop policy if exists "invoices admin update" on public.invoices;
create policy "invoices admin update"
  on public.invoices for update
  using (public.is_vendor_team_admin(vendor_id));

create or replace function public.invoices_assign_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  next_num integer;
begin
  if new.invoice_number is null or btrim(new.invoice_number) = '' then
    select coalesce(max(nullif(regexp_replace(invoice_number, '\D', '', 'g'), '')::integer), 0) + 1
      into next_num
      from public.invoices
      where vendor_id = new.vendor_id;
    new.invoice_number := 'INV-' || lpad(next_num::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_assign_number_trg on public.invoices;
create trigger invoices_assign_number_trg
  before insert on public.invoices
  for each row execute function public.invoices_assign_number();

create or replace function public.get_invoice_for_checkout(p_slug text)
returns table (
  id uuid,
  vendor_id uuid,
  invoice_number text,
  bill_to_name text,
  bill_to_email text,
  issue_date date,
  due_date date,
  notes text,
  line_items jsonb,
  subtotal_cents integer,
  tax_rate_bps integer,
  tax_cents integer,
  total_cents integer,
  currency text,
  status text,
  vendor_business_name text,
  vendor_logo_url text
) language sql stable security definer set search_path = public as $$
  select
    i.id, i.vendor_id, i.invoice_number, i.bill_to_name, i.bill_to_email,
    i.issue_date, i.due_date, i.notes, i.line_items, i.subtotal_cents,
    i.tax_rate_bps, i.tax_cents, i.total_cents, i.currency, i.status,
    vp.business_name, vp.logo_url
  from public.invoices i
  join public.vendor_profiles vp on vp.id = i.vendor_id
  where i.slug = p_slug
    and i.status in ('sent', 'overdue')
  limit 1;
$$;

grant execute on function public.get_invoice_for_checkout(text) to anon, authenticated;
