-- Round-4 hardening of vendor_dispute_upsert:
--
-- 1. NULL-handling in the ON CONFLICT WHERE: comparing
--    `excluded.last_event_created_at >= existing.last_event_created_at`
--    yields NULL (treated as false) when EITHER side is null. The
--    previous version handled `existing IS NULL` via OR but did not
--    handle `excluded IS NULL`. Now we wrap both sides in
--    COALESCE(..., '-infinity'::timestamptz) so a null on either
--    side compares as the earliest possible value: a null on
--    excluded fails the >= test (correct — drop a malformed event),
--    a null on existing makes -infinity <= anything so the update
--    proceeds (correct — backfill).
--
-- 2. Returns boolean (`true` when a write happened) so the caller
--    can distinguish "wrote" from "skipped as stale" from "errored"
--    for telemetry purposes. Without this, the previous void RPC
--    masked the exact case the ordering migration was meant to
--    handle (out-of-order Stripe redelivery) with zero log signal.

-- The previous version returned `void` and CREATE OR REPLACE
-- cannot change return type. Drop first.
drop function if exists public.vendor_dispute_upsert(text, uuid, text, text, integer, text, text, text, jsonb, timestamptz);

create or replace function public.vendor_dispute_upsert(
  p_stripe_dispute_id text,
  p_vendor_id uuid,
  p_charge_id text,
  p_payment_intent_id text,
  p_amount_cents integer,
  p_currency text,
  p_reason text,
  p_status text,
  p_raw_payload jsonb,
  p_event_created_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _touched boolean;
begin
  insert into public.vendor_disputes (
    stripe_dispute_id, vendor_id, charge_id, payment_intent_id,
    amount_cents, currency, reason, status, raw_payload,
    last_event_created_at
  ) values (
    p_stripe_dispute_id, p_vendor_id, p_charge_id, p_payment_intent_id,
    p_amount_cents, p_currency, p_reason, p_status, p_raw_payload,
    p_event_created_at
  )
  on conflict (stripe_dispute_id) do update set
    vendor_id = coalesce(excluded.vendor_id, public.vendor_disputes.vendor_id),
    charge_id = excluded.charge_id,
    payment_intent_id = excluded.payment_intent_id,
    amount_cents = excluded.amount_cents,
    currency = excluded.currency,
    reason = excluded.reason,
    status = excluded.status,
    raw_payload = excluded.raw_payload,
    last_event_created_at = excluded.last_event_created_at,
    updated_at = now()
  where coalesce(excluded.last_event_created_at, '-infinity'::timestamptz)
     >= coalesce(public.vendor_disputes.last_event_created_at, '-infinity'::timestamptz);
  get diagnostics _touched = row_count;
  return _touched > 0;
end;
$$;

revoke all on function public.vendor_dispute_upsert(text, uuid, text, text, integer, text, text, text, jsonb, timestamptz) from public;
grant execute on function public.vendor_dispute_upsert(text, uuid, text, text, integer, text, text, text, jsonb, timestamptz) to service_role;
