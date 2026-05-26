-- Atomic helper so vendorapay-webhook can increment payment_attempts
-- without a read-modify-write race when several payment_intent.payment_failed
-- events arrive for the same invoice (e.g. retries on a declined card).

create or replace function public.invoice_record_payment_failure(
  p_invoice_id uuid,
  p_message text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.invoices
  set payment_failure_message = p_message,
      payment_failed_at = now(),
      payment_attempts = payment_attempts + 1,
      updated_at = now()
  where id = p_invoice_id;
$$;

revoke all on function public.invoice_record_payment_failure(uuid, text) from public;
grant execute on function public.invoice_record_payment_failure(uuid, text) to service_role;
