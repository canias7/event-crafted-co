-- Atomic late-fee increment. The original UI implementation in
-- InvoicesTab read total_cents + late_fee_cents from React state,
-- summed them with the new fee, and wrote back the result — a
-- classic read-modify-write that loses updates when two admins
-- click "Late fee" at roughly the same time (or one double-clicks).
--
-- This RPC does the arithmetic in SQL so concurrent calls serialize
-- correctly: each one reads the LIVE total + fee, adds its delta,
-- and writes — Postgres row-locks during the UPDATE so no fee gets
-- silently overwritten.
--
-- Returns the new (total_cents, late_fee_cents) tuple so the UI can
-- toast the resulting amount without a second roundtrip.

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
begin
  if p_fee_cents is null or p_fee_cents <= 0 then
    raise exception 'fee_cents must be positive';
  end if;

  -- Authorization: caller must be an admin of the invoice's vendor.
  -- security definer means RLS is bypassed inside this function, so
  -- we re-check by hand using the same is_vendor_team_admin helper
  -- the table-level policies use.
  select vendor_id into v_vendor_id from public.invoices where id = p_invoice_id;
  if v_vendor_id is null then
    raise exception 'invoice not found';
  end if;
  if not public.is_vendor_team_admin(v_vendor_id) then
    raise exception 'not authorized';
  end if;

  -- Atomic increment. The UPDATE acquires a row lock so a concurrent
  -- invocation waits for our commit before reading its own baseline.
  return query
    update public.invoices
       set late_fee_cents = late_fee_cents + p_fee_cents,
           total_cents = total_cents + p_fee_cents,
           late_fee_added_at = now(),
           updated_at = now()
     where id = p_invoice_id
    returning invoices.total_cents, invoices.late_fee_cents;
end;
$$;

grant execute on function public.invoice_add_late_fee(uuid, integer) to authenticated;
