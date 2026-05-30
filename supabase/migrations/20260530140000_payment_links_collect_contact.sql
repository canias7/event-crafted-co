-- Pay links: optional host contact collection + expiry already exists.
--
-- Adds three columns to payment_links:
--   collect_contact boolean  — vendor opted to require the host's name
--                              + phone at checkout (the embedded Payment
--                              Element shows those fields when true).
--   host_name        text    — captured from the charge's billing_details
--                              by vendorapay-webhook on payment.succeeded,
--                              same pattern as the existing host_email.
--   host_phone       text    — same.
--
-- These are settlement-adjacent (written by the webhook under the service
-- role) but NOT money fields, so the settlement-protect trigger doesn't
-- need to guard them. collect_contact is vendor-writable at creation;
-- host_name/host_phone are only ever set by the webhook.

alter table public.payment_links
  add column if not exists collect_contact boolean not null default false;

alter table public.payment_links
  add column if not exists host_name text;

alter table public.payment_links
  add column if not exists host_phone text;

-- Expose collect_contact to the public (no-JWT) checkout page so it knows
-- whether to render the name/phone fields. The RPC is SECURITY DEFINER
-- with a fixed column list, so it must be DROPPED + recreated to change
-- the return type (Postgres rejects a return-type change via REPLACE).
-- (expires_at intentionally NOT exposed: the edge functions enforce expiry
-- server-side; the page only needs status + display fields + this flag.)
drop function if exists public.get_payment_link_for_checkout(text);

create function public.get_payment_link_for_checkout(p_slug text)
returns table (
  id uuid,
  vendor_id uuid,
  title text,
  description text,
  amount_cents integer,
  currency text,
  status text,
  vendor_business_name text,
  vendor_logo_url text,
  collect_contact boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select pl.id, pl.vendor_id, pl.title, pl.description, pl.amount_cents,
    pl.currency, pl.status, vp.business_name, vp.logo_url, pl.collect_contact
  from public.payment_links pl
  join public.vendor_profiles vp on vp.id = pl.vendor_id
  where pl.slug = p_slug
  limit 1;
$function$;

grant execute on function public.get_payment_link_for_checkout(text) to anon, authenticated;
