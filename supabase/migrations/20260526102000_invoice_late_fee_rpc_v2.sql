-- Two fixes to invoice_add_late_fee surfaced by the second-pass
-- audit (see code-review for full failure scenarios):
--
-- 1. Status guard. The UI gates the button on status ∈ {sent,
--    overdue}, but ~2s of webhook latency between the buyer
--    finishing checkout and the vendor's UI seeing status='paid'
--    let a stale click bump total_cents on an already-paid invoice
--    — which then shows the inflated total in Reports gross.
--    Now enforced in SQL via the WHERE clause; if 0 rows update,
--    raise so the UI sees a clear error.
--
-- 2. Preserve the FIRST late-fee timestamp. The schema comment
--    promised "audit timestamp; helpful if a buyer disputes the fee"
--    but every call overwrote the prior value, so after a second
--    fee was added the original add timestamp was lost. Use
--    coalesce() to keep the first non-null value.

create or replace function public.invoice_add_late_fee(
  p_invoice_id uuid,
  p_fee_cents integer
)
returns table (
  total_cents integer,
  late_fee_cents integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor_id uuid;
  v_updated_total integer;
  v_updated_fee integer;
begin
  if p_fee_cents is null or p_fee_cents <= 0 then
    raise exception 'fee_cents must be positive';
  end if;

  select vendor_id into v_vendor_id from public.invoices where id = p_invoice_id;
  if v_vendor_id is null then
    raise exception 'invoice not found';
  end if;
  if not public.is_vendor_team_admin(v_vendor_id) then
    raise exception 'not authorized';
  end if;

  -- Atomic increment, gated on a status the late fee actually
  -- makes sense for. WHERE clause does double duty:
  --   - serializes concurrent calls (row lock during UPDATE)
  --   - rejects out-of-state rows even if the UI thought otherwise
  update public.invoices
     set late_fee_cents = late_fee_cents + p_fee_cents,
         total_cents = total_cents + p_fee_cents,
         -- coalesce keeps the FIRST fee's timestamp for audit
         -- purposes. Without this a vendor disputing whether the
         -- fee was added with notice has only the most-recent
         -- bump's timestamp on the row.
         late_fee_added_at = coalesce(late_fee_added_at, now()),
         updated_at = now()
   where id = p_invoice_id
     and status in ('sent', 'overdue')
  returning invoices.total_cents, invoices.late_fee_cents
    into v_updated_total, v_updated_fee;

  if v_updated_total is null then
    -- Either the row vanished (impossible after the earlier select)
    -- or status moved out of (sent, overdue) — most likely a
    -- webhook flipped status to 'paid' between the UI check and
    -- this call.
    raise exception 'invoice not eligible for late fee (status changed)';
  end if;

  return query select v_updated_total, v_updated_fee;
end;
$$;

grant execute on function public.invoice_add_late_fee(uuid, integer) to authenticated;
