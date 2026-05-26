-- Audit-3 fixes for vendor_dispute_upsert:
--
-- 1. Out-of-order event protection. Stripe webhook re-delivery can
--    surface an older event AFTER a newer one. The previous RPC
--    unconditionally overwrote status + raw_payload, so a delayed
--    dispute.updated (status='under_review') arriving after
--    dispute.closed (status='won') would revert the dispute to
--    open. Add `last_event_created_at`, pass the Stripe event
--    timestamp from the webhook, and gate ON CONFLICT updates on
--    `EXCLUDED.last_event_created_at >= existing.last_event_created_at`.
--
-- 2. vendor_id mis-attribution. The COALESCE direction
--    `coalesce(existing.vendor_id, excluded.vendor_id)` preserved
--    the FIRST-event resolution even when a later event correctly
--    re-resolved a different vendor. Swap to
--    `coalesce(excluded.vendor_id, existing.vendor_id)` so a later
--    event with a non-null vendor_id wins; null still falls back
--    to whatever was there.

alter table public.vendor_disputes
  add column if not exists last_event_created_at timestamptz;

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
) returns void
language sql
security definer
set search_path = public
as $$
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
    -- Trust the latest event's resolution: if it has a non-null
    -- vendor_id, use it (it has fresher info via the webhook's
    -- lookup); otherwise keep whatever we already had.
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
  -- Skip the update when this event is older than what we last
  -- recorded. NULL on the existing column (legacy rows from before
  -- this migration) is treated as "always older" so we'll happily
  -- backfill the timestamp on the next event.
  where public.vendor_disputes.last_event_created_at is null
     or excluded.last_event_created_at >= public.vendor_disputes.last_event_created_at;
$$;

-- Drop the old 9-arg signature so the 10-arg signature is the
-- only one the webhook can resolve.
drop function if exists public.vendor_dispute_upsert(text, uuid, text, text, integer, text, text, text, jsonb);

revoke all on function public.vendor_dispute_upsert(text, uuid, text, text, integer, text, text, text, jsonb, timestamptz) from public;
grant execute on function public.vendor_dispute_upsert(text, uuid, text, text, integer, text, text, text, jsonb, timestamptz) to service_role;
