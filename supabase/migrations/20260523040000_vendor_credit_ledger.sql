-- Credit ledger for Vendora's AI features. Per-user balance +
-- append-only transaction log.
--
-- Why per-user (not per-listing): subscriptions are billed at the
-- human-account level. A vendor with 5 listings on Pro has ONE
-- credit balance that they spend across all of them. Tier still
-- lives on vendor_profiles for now (that's where the existing
-- Stripe wiring put it); the monthly-grant cron will pick the
-- highest tier across a user's listings to decide their grant.
--
-- Pricing reference (at time of migration):
--   1 credit = $0.025 retail
--   Avg API cost = ~$0.008/credit (mix of Claude $0.008, Higgsfield
--                                    $0.015, Mux $0.008)
--   ~68% gross margin at this price point.

-- ---------------------------------------------------------------
-- 1. Balance table: one row per user, updated atomically.
-- ---------------------------------------------------------------
create table public.vendor_credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Spendable balance right now. Drained by consume_credits.
  balance integer not null default 0 check (balance >= 0),

  -- Most recent monthly allotment (so UI can show "200/200 used").
  monthly_grant integer not null default 0,

  -- Current grant period bookends. Cron rolls over when period_ends_at
  -- passes: previous period's leftover becomes rollover_balance with
  -- a 30-day expiry, then a fresh monthly_grant lands.
  period_started_at timestamptz,
  period_ends_at timestamptz,

  -- Lifetime stats for ops/analytics. Not used for spending.
  lifetime_granted integer not null default 0,
  lifetime_consumed integer not null default 0,
  lifetime_topped_up integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 2. Transaction log: append-only audit trail.
-- ---------------------------------------------------------------
create table public.vendor_credit_transactions (
  id bigint primary key generated always as identity,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Signed delta: positive = added, negative = spent.
  delta integer not null,

  -- Categorization for analytics + admin filters.
  kind text not null check (kind in (
    'monthly_grant',  -- recurring tier-based credit grant from cron
    'trial_grant',    -- one-time signup trial credits
    'topup',          -- vendor bought a top-up pack via Stripe
    'consume',        -- AI action consumed credits
    'refund',         -- AI call failed and credits were returned
    'rollover',       -- previous period's unspent credits moved
    'expire',         -- rollover credits expired
    'admin_grant',    -- support bumped balance manually
    'admin_revoke'    -- support clawed back credits
  )),

  -- For consume/refund: which AI surface and what record it ties to.
  action_type text,
  ref_id text,

  -- For topup/monthly_grant: link back to the Stripe object that
  -- triggered the credit movement.
  stripe_event_id text,
  stripe_invoice_id text,

  -- Snapshot of balance AFTER this row applied. Lets the UI render
  -- a history with running totals without recomputing on every read.
  balance_after integer not null,

  -- Optional human-readable note (admin tools, error reasons).
  note text,

  created_at timestamptz not null default now()
);

create index vendor_credit_transactions_user_created_idx
  on public.vendor_credit_transactions (user_id, created_at desc);

-- Idempotency on Stripe events: never grant the same checkout twice.
create unique index vendor_credit_transactions_stripe_event_unique
  on public.vendor_credit_transactions (stripe_event_id)
  where stripe_event_id is not null;

-- ---------------------------------------------------------------
-- 3. RLS. Vendors read their own balance + transactions.
-- Service role bypasses (used by the consume/grant RPCs below).
-- ---------------------------------------------------------------
alter table public.vendor_credit_balances enable row level security;
alter table public.vendor_credit_transactions enable row level security;

create policy "vendor_credit_balances select own"
  on public.vendor_credit_balances
  for select to authenticated
  using (auth.uid() = user_id);

create policy "vendor_credit_transactions select own"
  on public.vendor_credit_transactions
  for select to authenticated
  using (auth.uid() = user_id);

-- No insert/update/delete policies on either table for normal users
-- -- mutations only via the security-definer RPCs.

-- ---------------------------------------------------------------
-- 4. consume_credits: atomic spend.
--
-- The UPDATE locks the balance row, so two concurrent consumes for
-- the same user serialize. The `balance >= p_n` guard inside the
-- WHERE makes the "insufficient credits" case race-free: either we
-- successfully decrement and get a positive new balance back, or
-- the WHERE didn't match and v_new_balance is null.
-- ---------------------------------------------------------------
create or replace function public.consume_credits(
  p_user_id uuid,
  p_n integer,
  p_action_type text,
  p_ref_id text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance integer;
begin
  if p_n <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  -- New vendors: ensure a balance row exists at 0 before we try to
  -- decrement. ON CONFLICT DO NOTHING makes this safe under
  -- concurrent calls.
  insert into public.vendor_credit_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.vendor_credit_balances
     set balance = balance - p_n,
         lifetime_consumed = lifetime_consumed + p_n,
         updated_at = now()
   where user_id = p_user_id
     and balance >= p_n
   returning balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into public.vendor_credit_transactions
    (user_id, delta, kind, action_type, ref_id, balance_after)
  values
    (p_user_id, -p_n, 'consume', p_action_type, p_ref_id, v_new_balance);

  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------
-- 5. refund_credits: undo a consume when the downstream AI call
-- failed. Edge functions call this in the catch path after a
-- prior consume_credits succeeded.
-- ---------------------------------------------------------------
create or replace function public.refund_credits(
  p_user_id uuid,
  p_n integer,
  p_action_type text,
  p_ref_id text default null,
  p_reason text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance integer;
begin
  if p_n <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  update public.vendor_credit_balances
     set balance = balance + p_n,
         lifetime_consumed = greatest(0, lifetime_consumed - p_n),
         updated_at = now()
   where user_id = p_user_id
   returning balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'no_credit_balance_row' using errcode = 'P0002';
  end if;

  insert into public.vendor_credit_transactions
    (user_id, delta, kind, action_type, ref_id, balance_after, note)
  values
    (p_user_id, p_n, 'refund', p_action_type, p_ref_id, v_new_balance, p_reason);

  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------
-- 6. grant_credits: monthly tier grant, signup trial, top-up
-- purchase, admin bump. Stripe event id is recorded for
-- idempotency on the unique partial index above; passing the same
-- event_id twice fails the INSERT and the grant rolls back.
-- ---------------------------------------------------------------
create or replace function public.grant_credits(
  p_user_id uuid,
  p_n integer,
  p_kind text,
  p_stripe_event_id text default null,
  p_stripe_invoice_id text default null,
  p_note text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance integer;
begin
  if p_n <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_kind not in (
    'monthly_grant','trial_grant','topup','rollover','admin_grant'
  ) then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  insert into public.vendor_credit_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.vendor_credit_balances
     set balance = balance + p_n,
         lifetime_granted = case
           when p_kind in ('monthly_grant','trial_grant','rollover','admin_grant')
             then lifetime_granted + p_n
           else lifetime_granted
         end,
         lifetime_topped_up = case
           when p_kind = 'topup'
             then lifetime_topped_up + p_n
           else lifetime_topped_up
         end,
         updated_at = now()
   where user_id = p_user_id
   returning balance into v_new_balance;

  insert into public.vendor_credit_transactions
    (user_id, delta, kind, stripe_event_id, stripe_invoice_id, balance_after, note)
  values
    (p_user_id, p_n, p_kind, p_stripe_event_id, p_stripe_invoice_id, v_new_balance, p_note);

  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------
-- 7. admin_revoke_credits: support clawback (fraud, refunds).
-- ---------------------------------------------------------------
create or replace function public.admin_revoke_credits(
  p_user_id uuid,
  p_n integer,
  p_note text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance integer;
begin
  if p_n <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  update public.vendor_credit_balances
     set balance = greatest(0, balance - p_n),
         updated_at = now()
   where user_id = p_user_id
   returning balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'no_credit_balance_row' using errcode = 'P0002';
  end if;

  insert into public.vendor_credit_transactions
    (user_id, delta, kind, balance_after, note)
  values
    (p_user_id, -p_n, 'admin_revoke', v_new_balance, p_note);

  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------
-- 8. Grants. consume + refund are called from edge functions
-- (service_role), and from the cron worker (service_role). Vendors
-- never call these directly -- only read via the policies above.
-- ---------------------------------------------------------------
revoke all on function public.consume_credits(uuid, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.refund_credits(uuid, integer, text, text, text)
  from public, anon, authenticated;
revoke all on function public.grant_credits(uuid, integer, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_revoke_credits(uuid, integer, text)
  from public, anon, authenticated;

grant execute on function public.consume_credits(uuid, integer, text, text)
  to service_role;
grant execute on function public.refund_credits(uuid, integer, text, text, text)
  to service_role;
grant execute on function public.grant_credits(uuid, integer, text, text, text, text)
  to service_role;
-- admin_revoke is callable by authenticated admins via is_admin();
-- still re-grant to authenticated so the RPC reaches the function,
-- then is_admin() inside gates the actual mutation.
grant execute on function public.admin_revoke_credits(uuid, integer, text)
  to authenticated, service_role;
