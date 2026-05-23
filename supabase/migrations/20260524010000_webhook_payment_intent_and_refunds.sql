-- Audit fix #9: missing webhook handlers for refunds, pauses,
-- disputes. To revoke credits on a top-up refund we need to link
-- the refund event back to the original top-up grant. Stripe gives
-- us the payment_intent on the charge — store it on the original
-- transaction so the refund handler can look it up.

alter table public.vendor_credit_transactions
  add column if not exists stripe_payment_intent_id text;

create index if not exists vendor_credit_transactions_payment_intent_idx
  on public.vendor_credit_transactions (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- Reverse a top-up grant. Looks up the original transaction by
-- payment_intent_id, asserts it was a top-up, then:
--   1. Inserts a 'refund' kind row with the reversing delta
--      (stripe_event_id keyed on the refund event for idempotency)
--   2. Decrements balance + lifetime_topped_up
--
-- Partial refunds: caller passes the refunded credit count (cents
-- refunded * credits_per_dollar). Whole-dollar packs only today so
-- partial is rare, but the function handles it.
--
-- Idempotent on stripe_event_id — Stripe retries land as no-ops.

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
  v_balance_after integer;
begin
  if p_n <= 0 then
    raise exception 'revoke_topup_credits: p_n must be positive (got %)', p_n;
  end if;

  -- Idempotency: stripe_event_id is the refund event id. Unique
  -- partial index on stripe_event_id makes this fail with 23505 on
  -- replay, which the caller catches and treats as success.
  insert into public.vendor_credit_transactions
    (user_id, delta, kind, stripe_event_id, stripe_payment_intent_id, note)
  values
    (p_user_id, -p_n, 'refund', p_stripe_event_id, p_stripe_payment_intent_id, p_note);

  update public.vendor_credit_balances
     set balance = greatest(0, balance - p_n),
         lifetime_topped_up = greatest(0, lifetime_topped_up - p_n),
         updated_at = now()
   where user_id = p_user_id
   returning balance into v_balance_after;

  -- Stamp balance_after on the just-inserted row.
  update public.vendor_credit_transactions
     set balance_after = coalesce(v_balance_after, 0)
   where stripe_event_id = p_stripe_event_id;

  return coalesce(v_balance_after, 0);
end;
$$;

grant execute on function public.revoke_topup_credits(uuid, integer, text, text, text) to service_role;
