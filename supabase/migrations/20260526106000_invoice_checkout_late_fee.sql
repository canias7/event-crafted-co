-- get_invoice_for_checkout now returns late_fee_cents so the
-- buyer-facing Pay page can render the late fee as its own line.
-- Without this, a late-fee'd invoice shows Subtotal + Tax that
-- doesn't add up to Total Due — buyer sees a math mismatch and
-- thinks the vendor made an error (or worse, that they're being
-- overcharged). The Stripe Checkout page itself correctly
-- itemizes the fee (PR #987), but the pre-checkout summary on
-- our own /pay/invoice/:slug page was wrong.

-- DROP first: changing the OUT parameter list (adding late_fee_cents)
-- is a row-type change Postgres refuses to apply via CREATE OR
-- REPLACE alone.
drop function if exists public.get_invoice_for_checkout(text);

create or replace function public.get_invoice_for_checkout(p_slug text)
returns table (
  id uuid,
  vendor_id uuid,
  invoice_number text,
  bill_to_name text,
  bill_to_email text,
  issue_date date,
  due_date date,
  notes text,
  line_items jsonb,
  subtotal_cents integer,
  tax_rate_bps integer,
  tax_cents integer,
  total_cents integer,
  late_fee_cents integer,
  currency text,
  status text,
  vendor_business_name text,
  vendor_logo_url text
) language sql stable security definer set search_path = public as $$
  select i.id, i.vendor_id, i.invoice_number, i.bill_to_name, i.bill_to_email,
    i.issue_date, i.due_date, i.notes, i.line_items, i.subtotal_cents,
    i.tax_rate_bps, i.tax_cents, i.total_cents, i.late_fee_cents, i.currency, i.status,
    vp.business_name, vp.logo_url
  from public.invoices i
  join public.vendor_profiles vp on vp.id = i.vendor_id
  where i.slug = p_slug
  limit 1;
$$;

grant execute on function public.get_invoice_for_checkout(text) to anon, authenticated;
