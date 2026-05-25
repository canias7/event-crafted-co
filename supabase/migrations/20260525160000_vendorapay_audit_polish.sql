-- Audit fix #14: bump slug length on new rows to 24 hex chars
-- (~96 bits, enumeration-resistant). Existing rows keep their
-- 12-char slugs.
alter table public.payment_links
  alter column slug set default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 24));
alter table public.invoices
  alter column slug set default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 24));

-- Audit fix #23: currency lock. Multi-currency isn't wired yet —
-- vendor account is country='US' and Stripe Connect transfers
-- require matching currency. Block non-USD inserts.
alter table public.payment_links
  drop constraint if exists payment_links_currency_usd;
alter table public.payment_links
  add constraint payment_links_currency_usd check (currency = 'usd');
alter table public.invoices
  drop constraint if exists invoices_currency_usd;
alter table public.invoices
  add constraint invoices_currency_usd check (currency = 'usd');

-- Audit fix #12: harden invoice_number trigger so an existing row
-- with no digits (e.g. 'ABC-FOO') doesn't break every future insert
-- for that vendor.
create or replace function public.invoices_assign_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  next_num integer;
  existing_max integer;
begin
  if new.invoice_number is null or btrim(new.invoice_number) = '' then
    select coalesce(
      max(
        coalesce(
          nullif(regexp_replace(invoice_number, '\D', '', 'g'), '')::integer,
          0
        )
      ),
      0
    ) + 1
    into next_num
    from public.invoices
    where vendor_id = new.vendor_id;
    new.invoice_number := 'INV-' || lpad(next_num::text, 4, '0');
  end if;
  return new;
exception when others then
  -- Last-resort fallback: count + 1. Never fail the insert.
  select count(*) + 1 into existing_max from public.invoices where vendor_id = new.vendor_id;
  new.invoice_number := 'INV-' || lpad(existing_max::text, 4, '0');
  return new;
end;
$$;
