-- Two bookkeeping-adjacent tables.
--
-- vendor_contractors: people the vendor pays (sound techs, drivers,
-- helpers). At year-end the vendor needs to issue 1099-NEC forms
-- to anyone paid $600+. This table is the source-of-truth list;
-- payments are tagged via vendor_expenses.contractor_id (which we
-- add below). YTD totals per contractor surface on the Reports tab.
--
-- vendor_payout_reconciliations: vendor confirms a Stripe payout
-- landed in their bank by stamping the row. Keyed on stripe_payout_id
-- (one row per payout). bank_deposit_ref lets the vendor record the
-- matching bank statement line for audit.
--
-- Both gated by RLS to the vendor's team.

create table if not exists public.vendor_contractors (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  -- We deliberately store ONLY the last 4 digits of the tax id
  -- (SSN/EIN). Full numbers belong in the vendor's payroll provider,
  -- not in our DB — a breach exposing full SSNs is a different
  -- regulatory tier than one exposing last-4.
  tax_id_last4 text check (tax_id_last4 is null or tax_id_last4 ~ '^[0-9]{4}$'),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_contractors_vendor_idx
  on public.vendor_contractors (vendor_id, created_at desc);

alter table public.vendor_contractors enable row level security;

create policy vendor_contractors_select
  on public.vendor_contractors for select
  using (public.is_vendor_member(vendor_id));

create policy vendor_contractors_insert
  on public.vendor_contractors for insert
  with check (
    public.is_vendor_team_admin(vendor_id)
    and created_by = auth.uid()
  );

create policy vendor_contractors_update
  on public.vendor_contractors for update
  using (public.is_vendor_team_admin(vendor_id))
  with check (public.is_vendor_team_admin(vendor_id));

create policy vendor_contractors_delete
  on public.vendor_contractors for delete
  using (public.is_vendor_team_admin(vendor_id));

-- Tag expenses with the contractor they paid. Nullable because most
-- expenses (rentals, supplies, gas) aren't to a 1099-eligible
-- person. Set null on contractor delete so the expense ledger
-- doesn't get wiped — the cash record matters more than the link.
alter table public.vendor_expenses
  add column if not exists contractor_id uuid references public.vendor_contractors(id) on delete set null;

create index if not exists vendor_expenses_contractor_idx
  on public.vendor_expenses (contractor_id)
  where contractor_id is not null;

create or replace function public.vendor_contractors_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vendor_contractors_touch_updated_at on public.vendor_contractors;
create trigger vendor_contractors_touch_updated_at
  before update on public.vendor_contractors
  for each row execute function public.vendor_contractors_touch_updated_at();

-- ---- Payout reconciliations ------------------------------------

create table if not exists public.vendor_payout_reconciliations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  -- Stripe payout id (po_*) — one reconciliation row per payout,
  -- unique-constrained so a double-click doesn't double-insert.
  stripe_payout_id text not null,
  reconciled_at timestamptz not null default now(),
  reconciled_by uuid not null references auth.users(id),
  -- Free text — bank deposit reference, statement line, anything
  -- the vendor wants to record so an auditor can cross-reference.
  bank_deposit_ref text,
  notes text,
  created_at timestamptz not null default now(),
  unique (vendor_id, stripe_payout_id)
);

create index if not exists vendor_payout_reconciliations_vendor_idx
  on public.vendor_payout_reconciliations (vendor_id, reconciled_at desc);

alter table public.vendor_payout_reconciliations enable row level security;

create policy vendor_payout_reconciliations_select
  on public.vendor_payout_reconciliations for select
  using (public.is_vendor_member(vendor_id));

create policy vendor_payout_reconciliations_insert
  on public.vendor_payout_reconciliations for insert
  with check (
    public.is_vendor_team_admin(vendor_id)
    and reconciled_by = auth.uid()
  );

create policy vendor_payout_reconciliations_update
  on public.vendor_payout_reconciliations for update
  using (public.is_vendor_team_admin(vendor_id))
  with check (public.is_vendor_team_admin(vendor_id));

create policy vendor_payout_reconciliations_delete
  on public.vendor_payout_reconciliations for delete
  using (public.is_vendor_team_admin(vendor_id));
