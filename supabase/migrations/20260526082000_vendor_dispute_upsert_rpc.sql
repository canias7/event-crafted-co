-- Atomic upsert helper for vendorapay-webhook's charge.disputed
-- handler. The previous client-side flow was a check-then-act
-- (UPDATE then INSERT-if-no-rows) that lost data under two
-- different failure modes:
--   1. Concurrent webhook deliveries for the same stripe_dispute_id
--      with different event_ids (e.g. dispute.created + dispute.updated)
--      both saw "no row", both INSERT'd, the second hit the unique
--      constraint and silently failed.
--   2. A transient UPDATE error returned data=null which the caller
--      mis-interpreted as "no row" and fell through to INSERT,
--      same collision.
-- This RPC consolidates both paths into a single INSERT ... ON
-- CONFLICT statement that's atomic and preserves an
-- already-resolved vendor_id when a later event can't re-resolve it.
create or replace function public.vendor_dispute_upsert(
  p_stripe_dispute_id text,
  p_vendor_id uuid,
  p_charge_id text,
  p_payment_intent_id text,
  p_amount_cents integer,
  p_currency text,
  p_reason text,
  p_status text,
  p_raw_payload jsonb
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.vendor_disputes (
    stripe_dispute_id, vendor_id, charge_id, payment_intent_id,
    amount_cents, currency, reason, status, raw_payload
  ) values (
    p_stripe_dispute_id, p_vendor_id, p_charge_id, p_payment_intent_id,
    p_amount_cents, p_currency, p_reason, p_status, p_raw_payload
  )
  on conflict (stripe_dispute_id) do update set
    -- Never blank an already-resolved vendor_id: a later event that
    -- can't re-resolve (source row deleted) would otherwise hide
    -- the dispute from the vendor's tab (RLS gates on vendor_id).
    vendor_id = coalesce(public.vendor_disputes.vendor_id, excluded.vendor_id),
    -- Always refresh the rest from the latest event so amount /
    -- payment_intent corrections from Stripe land.
    charge_id = excluded.charge_id,
    payment_intent_id = excluded.payment_intent_id,
    amount_cents = excluded.amount_cents,
    currency = excluded.currency,
    reason = excluded.reason,
    status = excluded.status,
    raw_payload = excluded.raw_payload,
    updated_at = now();
$$;

revoke all on function public.vendor_dispute_upsert(text, uuid, text, text, integer, text, text, text, jsonb) from public;
grant execute on function public.vendor_dispute_upsert(text, uuid, text, text, integer, text, text, text, jsonb) to service_role;
