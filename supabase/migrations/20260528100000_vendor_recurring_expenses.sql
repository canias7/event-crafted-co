-- Recurring expense rules. One row defines "auto-log this expense
-- every N units." The scan-vendor-recurring-expenses cron edge fn
-- wakes up daily, finds active rows where next_run_at <= now(), and
-- inserts a fresh vendor_expenses row mirroring the rule's template.

create table if not exists public.vendor_recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  interval text not null check (
    interval in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')
  ),
  -- Anchor day for monthly/quarterly/yearly cadences. Mirrors the
  -- recurring-invoices clamp logic so a "31st" rule doesn't drift
  -- through February.
  day_of_month smallint,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  category text not null,
  description text not null,
  item_name text,
  quantity text,
  paid_to text,
  notes text,
  contractor_id uuid references public.vendor_contractors(id) on delete set null,
  active boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  last_expense_id uuid references public.vendor_expenses(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_recurring_expenses_due_idx
  on public.vendor_recurring_expenses (next_run_at)
  where active;

create index if not exists vendor_recurring_expenses_vendor_idx
  on public.vendor_recurring_expenses (vendor_id, created_at desc);

alter table public.vendor_recurring_expenses enable row level security;

drop policy if exists "vendor_recurring_expenses owner read" on public.vendor_recurring_expenses;
create policy "vendor_recurring_expenses owner read"
  on public.vendor_recurring_expenses for select
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_recurring_expenses.vendor_id
        and vp.user_id = auth.uid()
    )
  );

drop policy if exists "vendor_recurring_expenses owner write" on public.vendor_recurring_expenses;
create policy "vendor_recurring_expenses owner write"
  on public.vendor_recurring_expenses for all
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_recurring_expenses.vendor_id
        and vp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_recurring_expenses.vendor_id
        and vp.user_id = auth.uid()
    )
  );

create or replace function public.vendor_recurring_expenses_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vendor_recurring_expenses_touch_trg on public.vendor_recurring_expenses;
create trigger vendor_recurring_expenses_touch_trg
  before update on public.vendor_recurring_expenses
  for each row execute function public.vendor_recurring_expenses_touch();

-- Forward link: lets the UI show a "↻ Recurring" badge on the
-- vendor_expenses rows the cron auto-created from a rule, and
-- lets the dashboard count rule-generated rows separately.
alter table public.vendor_expenses
  add column if not exists recurring_rule_id uuid
  references public.vendor_recurring_expenses(id) on delete set null;

create index if not exists vendor_expenses_recurring_rule_idx
  on public.vendor_expenses (recurring_rule_id)
  where recurring_rule_id is not null;
