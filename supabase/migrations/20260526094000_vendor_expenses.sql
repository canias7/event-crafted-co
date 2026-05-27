-- Vendor expenses table. Manual bookkeeping ledger so My Vendora's
-- Reports tab can compute a real Net Profit = Revenue − Refunds −
-- Stripe fees − Expenses, instead of stopping at "what landed in
-- the bank." A working vendor's CPA expects this category breakdown
-- on the year-end summary.
--
-- All amounts in integer cents. occurred_on is a calendar date (no
-- time-of-day) because expenses are typically reconciled per-day
-- against receipts, not per-second like payments.

create table if not exists public.vendor_expenses (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  occurred_on date not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  -- Predefined categories that match what tax software (Schedule C
  -- line items) and most state sales-tax forms expect. "other" is
  -- the escape hatch; vendors can use the notes field for detail.
  category text not null check (category in (
    'rentals',
    'supplies',
    'labor',
    'mileage',
    'marketing',
    'software',
    'fees',
    'meals',
    'travel',
    'insurance',
    'other'
  )),
  description text not null,
  paid_to text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_expenses_vendor_date_idx
  on public.vendor_expenses (vendor_id, occurred_on desc);

create index if not exists vendor_expenses_vendor_category_idx
  on public.vendor_expenses (vendor_id, category);

alter table public.vendor_expenses enable row level security;

-- Read: any team member of the vendor.
create policy vendor_expenses_select
  on public.vendor_expenses for select
  using (public.is_vendor_member(vendor_id));

-- Write: any team admin. is_vendor_team_admin matches the same
-- access check used for invoices + recurring rules.
create policy vendor_expenses_insert
  on public.vendor_expenses for insert
  with check (
    public.is_vendor_team_admin(vendor_id)
    and created_by = auth.uid()
  );

create policy vendor_expenses_update
  on public.vendor_expenses for update
  using (public.is_vendor_team_admin(vendor_id))
  with check (public.is_vendor_team_admin(vendor_id));

create policy vendor_expenses_delete
  on public.vendor_expenses for delete
  using (public.is_vendor_team_admin(vendor_id));

-- Touch updated_at on row updates. Same pattern as other vendor-
-- scoped tables.
create or replace function public.vendor_expenses_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vendor_expenses_touch_updated_at on public.vendor_expenses;
create trigger vendor_expenses_touch_updated_at
  before update on public.vendor_expenses
  for each row execute function public.vendor_expenses_touch_updated_at();
