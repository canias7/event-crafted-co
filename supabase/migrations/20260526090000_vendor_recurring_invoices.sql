-- Recurring invoice schedule. One row per (vendor, customer,
-- cadence) defines "send this invoice every N units until paused".
-- The scan-vendorapay-recurring scheduled function wakes up on a
-- cron, finds rows where next_run_at <= now and active, and emits
-- a fresh invoice via the same path as a manual send. Buyer pays
-- each one through /pay/invoice/<slug>; no card-on-file yet
-- (that's a future Stripe Subscriptions integration).
--
-- line_items + notes + tax_pct snapshot the invoice template at
-- creation time. Editing the recurring rule rewrites them; older
-- already-sent invoices stay frozen with whatever they had.

create table if not exists public.vendor_recurring_invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  customer_id uuid not null references public.vendor_customers(id) on delete cascade,
  interval text not null check (
    interval in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')
  ),
  day_of_month smallint,
  line_items jsonb not null default '[]'::jsonb,
  notes text,
  tax_pct numeric(5,2) not null default 0,
  active boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  last_invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_recurring_invoices_due_idx
  on public.vendor_recurring_invoices (next_run_at)
  where active;

create index if not exists vendor_recurring_invoices_customer_idx
  on public.vendor_recurring_invoices (customer_id, created_at desc);

alter table public.vendor_recurring_invoices enable row level security;

drop policy if exists "vendor_recurring_invoices owner read" on public.vendor_recurring_invoices;
create policy "vendor_recurring_invoices owner read" on public.vendor_recurring_invoices
  for select
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_recurring_invoices.vendor_id
        and vp.user_id = auth.uid()
    )
  );

drop policy if exists "vendor_recurring_invoices owner write" on public.vendor_recurring_invoices;
create policy "vendor_recurring_invoices owner write" on public.vendor_recurring_invoices
  for all
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_recurring_invoices.vendor_id
        and vp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_recurring_invoices.vendor_id
        and vp.user_id = auth.uid()
    )
  );

create or replace function public.vendor_recurring_invoices_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vendor_recurring_invoices_touch_trg on public.vendor_recurring_invoices;
create trigger vendor_recurring_invoices_touch_trg
  before update on public.vendor_recurring_invoices
  for each row execute function public.vendor_recurring_invoices_touch();
