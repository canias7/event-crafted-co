-- Round-2 audit L2: revoke_topup_credits computed v_balance_after
-- from an unlocked SELECT of balance, then INSERTed the transaction,
-- then UPDATEd balance to that pre-computed value. If a concurrent
-- consume_credits debited between the SELECT and the UPDATE, the
-- UPDATE would overwrite that consume (setting balance back to the
-- stale-pre-computed value). Fix: lock the balance row up front so
-- concurrent debits wait until the refund commits.

create or replace function public.revoke_topup_credits(
  p_user_id uuid,
  p_n integer,
  p_stripe_event_id text,
  p_stripe_payment_intent_id text,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_balance_after integer;
begin
  if p_n <= 0 then
    raise exception 'revoke_topup_credits: p_n must be positive (got %)', p_n;
  end if;

  -- Row lock prevents concurrent consume/refund from racing on the
  -- same balance. The unique partial index on stripe_event_id still
  -- gives idempotency for replayed refund events — they raise 23505
  -- before reaching this point.
  select coalesce(balance, 0) into v_current
    from public.vendor_credit_balances
   where user_id = p_user_id
   for update;
  v_balance_after := greatest(0, coalesce(v_current, 0) - p_n);

  insert into public.vendor_credit_transactions
    (user_id, delta, kind, stripe_event_id, stripe_payment_intent_id, balance_after, note)
  values
    (p_user_id, -p_n, 'refund', p_stripe_event_id, p_stripe_payment_intent_id,
     v_balance_after, p_note);

  update public.vendor_credit_balances
     set balance = v_balance_after,
         lifetime_topped_up = greatest(0, lifetime_topped_up - p_n),
         updated_at = now()
   where user_id = p_user_id;

  return v_balance_after;
end;
$$;
