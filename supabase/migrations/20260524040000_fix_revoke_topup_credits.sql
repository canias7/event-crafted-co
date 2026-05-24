-- Bug found during audit smoke test: revoke_topup_credits inserted
-- the 'refund' transaction row BEFORE computing balance_after, but
-- the column is NOT NULL. Every refund attempt failed with 23502
-- at insert time, so audit fix #9's charge.refunded handler would
-- have thrown on real refunds in production.
--
-- The fix has to be careful about ordering: if we update the
-- balance first then insert, a replayed refund event hits 23505
-- on the insert AFTER already decrementing — second replay
-- double-deducts.
--
-- Correct order: compute the would-be balance_after from current
-- balance up front, insert the transaction (idempotency gate
-- raises 23505 on replay before anything else runs), then update
-- the balance + lifetime_topped_up. Both insert and update commit
-- atomically as a single PL/pgSQL function call.

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

  select coalesce(balance, 0) into v_current
    from public.vendor_credit_balances
   where user_id = p_user_id;
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
