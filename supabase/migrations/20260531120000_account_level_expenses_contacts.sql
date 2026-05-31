-- Make Expenses / Contacts / Recurring-expenses account-level.
--
-- These four bookkeeping tables were scoped to a single listing
-- (vendor_id NOT NULL → vendor_profiles). That blocked a vendor with
-- no listing yet from logging expenses or saving contacts at all, and
-- conceptually they're per-business, not per-listing.
--
-- This migration adds an account owner (`user_id` → auth.users) to each
-- table, makes `vendor_id` NULLABLE (kept for back-compat + team access),
-- backfills user_id from the listing owner, and broadens RLS so a row is
-- accessible when EITHER:
--   • user_id = auth.uid()                          (the owner), OR
--   • the legacy listing-team check passes          (vendor_id path).
--
-- All four tables are currently empty in production, so the backfill is
-- a no-op and there's no data-migration risk.

-- ── vendor_customers ────────────────────────────────────────────────
alter table public.vendor_customers
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

update public.vendor_customers c
   set user_id = vp.user_id
  from public.vendor_profiles vp
 where vp.id = c.vendor_id and c.user_id is null;

alter table public.vendor_customers
  alter column vendor_id drop not null;

-- New uniqueness for account-level rows: one contact per (user, email).
-- Non-partial so PostgREST upsert ON CONFLICT (user_id,email) can infer
-- it. NULL user_id rows (legacy listing-only) stay allowed since NULLs
-- are distinct in a unique index.
create unique index if not exists vendor_customers_user_email_idx
  on public.vendor_customers (user_id, email);

drop policy if exists "vendor_customers owner read" on public.vendor_customers;
create policy "vendor_customers owner read" on public.vendor_customers
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_customers.vendor_id and vp.user_id = auth.uid()
    )
  );

drop policy if exists "vendor_customers owner write" on public.vendor_customers;
create policy "vendor_customers owner write" on public.vendor_customers
  for all using (
    user_id = auth.uid()
    or exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_customers.vendor_id and vp.user_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_customers.vendor_id and vp.user_id = auth.uid()
    )
  );

-- ── vendor_expenses ─────────────────────────────────────────────────
alter table public.vendor_expenses
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

update public.vendor_expenses e
   set user_id = vp.user_id
  from public.vendor_profiles vp
 where vp.id = e.vendor_id and e.user_id is null;

alter table public.vendor_expenses
  alter column vendor_id drop not null;

create index if not exists vendor_expenses_user_date_idx
  on public.vendor_expenses (user_id, occurred_on desc);

drop policy if exists vendor_expenses_select on public.vendor_expenses;
create policy vendor_expenses_select on public.vendor_expenses
  for select using (
    user_id = auth.uid() or public.is_vendor_member(vendor_id)
  );

drop policy if exists vendor_expenses_insert on public.vendor_expenses;
create policy vendor_expenses_insert on public.vendor_expenses
  for insert with check (
    created_by = auth.uid()
    and (user_id = auth.uid() or public.is_vendor_team_admin(vendor_id))
  );

drop policy if exists vendor_expenses_update on public.vendor_expenses;
create policy vendor_expenses_update on public.vendor_expenses
  for update using (
    user_id = auth.uid() or public.is_vendor_team_admin(vendor_id)
  ) with check (
    user_id = auth.uid() or public.is_vendor_team_admin(vendor_id)
  );

drop policy if exists vendor_expenses_delete on public.vendor_expenses;
create policy vendor_expenses_delete on public.vendor_expenses
  for delete using (
    user_id = auth.uid() or public.is_vendor_team_admin(vendor_id)
  );

-- ── vendor_contractors ──────────────────────────────────────────────
alter table public.vendor_contractors
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

update public.vendor_contractors c
   set user_id = vp.user_id
  from public.vendor_profiles vp
 where vp.id = c.vendor_id and c.user_id is null;

alter table public.vendor_contractors
  alter column vendor_id drop not null;

create index if not exists vendor_contractors_user_idx
  on public.vendor_contractors (user_id, created_at desc);

drop policy if exists vendor_contractors_select on public.vendor_contractors;
create policy vendor_contractors_select on public.vendor_contractors
  for select using (
    user_id = auth.uid() or public.is_vendor_member(vendor_id)
  );

drop policy if exists vendor_contractors_insert on public.vendor_contractors;
create policy vendor_contractors_insert on public.vendor_contractors
  for insert with check (
    created_by = auth.uid()
    and (user_id = auth.uid() or public.is_vendor_team_admin(vendor_id))
  );

drop policy if exists vendor_contractors_update on public.vendor_contractors;
create policy vendor_contractors_update on public.vendor_contractors
  for update using (
    user_id = auth.uid() or public.is_vendor_team_admin(vendor_id)
  ) with check (
    user_id = auth.uid() or public.is_vendor_team_admin(vendor_id)
  );

drop policy if exists vendor_contractors_delete on public.vendor_contractors;
create policy vendor_contractors_delete on public.vendor_contractors
  for delete using (
    user_id = auth.uid() or public.is_vendor_team_admin(vendor_id)
  );

-- ── vendor_recurring_expenses ───────────────────────────────────────
alter table public.vendor_recurring_expenses
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

update public.vendor_recurring_expenses r
   set user_id = vp.user_id
  from public.vendor_profiles vp
 where vp.id = r.vendor_id and r.user_id is null;

alter table public.vendor_recurring_expenses
  alter column vendor_id drop not null;

create index if not exists vendor_recurring_expenses_user_idx
  on public.vendor_recurring_expenses (user_id, created_at desc);

drop policy if exists "vendor_recurring_expenses owner read" on public.vendor_recurring_expenses;
create policy "vendor_recurring_expenses owner read" on public.vendor_recurring_expenses
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_recurring_expenses.vendor_id and vp.user_id = auth.uid()
    )
  );

drop policy if exists "vendor_recurring_expenses owner write" on public.vendor_recurring_expenses;
create policy "vendor_recurring_expenses owner write" on public.vendor_recurring_expenses
  for all using (
    user_id = auth.uid()
    or exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_recurring_expenses.vendor_id and vp.user_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_recurring_expenses.vendor_id and vp.user_id = auth.uid()
    )
  );
