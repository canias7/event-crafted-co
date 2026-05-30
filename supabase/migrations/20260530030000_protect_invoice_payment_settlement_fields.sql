-- Protect VendoraPay settlement fields on invoices + payment_links.
--
-- AUDIT FINDING (verified by exploit): the invoices / payment_links
-- UPDATE policy lets a vendor team admin write ANY column. proposals
-- already has proposals_protect_vendorapay_fields() guarding its
-- payment_status; invoices/payment_links had no equivalent, so a vendor
-- could run `update invoices set status='paid', paid_at=now()` directly
-- under RLS — bypassing the Stripe webhook — to fake a paid invoice or
-- stamp a false refunded_amount_cents (revenue/tax-reporting integrity).
-- No cross-vendor exposure (RLS still scopes to own rows) and no money
-- moves, but it's a self-dealing / reporting-integrity hole.
--
-- Fix mirrors the proven proposals trigger: a SECURITY INVOKER trigger
-- that lets service_role / postgres / supabase_admin through (the
-- webhook + edge functions use the service role key) and blocks
-- everyone else from:
--   * transitioning status INTO a settled state (paid / refunded /
--     partial_refund). Vendors may still set draft/sent/cancelled/
--     overdue/expired/scheduled/active client-side — those are
--     legitimate app flows.
--   * writing any of the payment/refund settlement columns.
--
-- SECURITY INVOKER is load-bearing: DEFINER would resolve current_user
-- to the function owner (postgres) and silently bypass the guard for
-- everyone, exactly as the proposals migration documents.

-- ── invoices ──────────────────────────────────────────────────────
create or replace function public.invoices_protect_settlement_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'service_role'
     or current_user = 'postgres'
     or current_user = 'supabase_admin'
     or pg_has_role(current_user, 'postgres', 'MEMBER') then
    return new;
  end if;

  -- Block transitions INTO a settled state from the client. Leaving a
  -- settled state (e.g. an erroneous manual fix) is equally blocked,
  -- because settled status should only ever be set by the webhook.
  if (new.status is distinct from old.status)
     and (new.status in ('paid', 'refunded', 'partial_refund')
          or old.status in ('paid', 'refunded', 'partial_refund')) then
    raise exception 'invoice settled status is set via VendoraPay only';
  end if;

  if new.paid_at is distinct from old.paid_at then
    raise exception 'paid_at is read-only (set via VendoraPay)';
  end if;
  if new.paid_payment_intent_id is distinct from old.paid_payment_intent_id then
    raise exception 'paid_payment_intent_id is read-only';
  end if;
  if new.refunded_amount_cents is distinct from old.refunded_amount_cents then
    raise exception 'refunded_amount_cents is read-only (set via VendoraPay)';
  end if;
  if new.refunded_at is distinct from old.refunded_at then
    raise exception 'refunded_at is read-only';
  end if;
  if new.payment_attempts is distinct from old.payment_attempts then
    raise exception 'payment_attempts is read-only';
  end if;
  if new.payment_failed_at is distinct from old.payment_failed_at then
    raise exception 'payment_failed_at is read-only';
  end if;
  if new.payment_failure_message is distinct from old.payment_failure_message then
    raise exception 'payment_failure_message is read-only';
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_protect_settlement_fields_trg on public.invoices;
create trigger invoices_protect_settlement_fields_trg
  before update of
    status, paid_at, paid_payment_intent_id, refunded_amount_cents,
    refunded_at, payment_attempts, payment_failed_at, payment_failure_message
  on public.invoices
  for each row
  execute function public.invoices_protect_settlement_fields();

-- ── payment_links ─────────────────────────────────────────────────
create or replace function public.payment_links_protect_settlement_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'service_role'
     or current_user = 'postgres'
     or current_user = 'supabase_admin'
     or pg_has_role(current_user, 'postgres', 'MEMBER') then
    return new;
  end if;

  if (new.status is distinct from old.status)
     and (new.status in ('paid', 'refunded', 'partial_refund')
          or old.status in ('paid', 'refunded', 'partial_refund')) then
    raise exception 'payment link settled status is set via VendoraPay only';
  end if;

  if new.paid_at is distinct from old.paid_at then
    raise exception 'paid_at is read-only (set via VendoraPay)';
  end if;
  if new.paid_payment_intent_id is distinct from old.paid_payment_intent_id then
    raise exception 'paid_payment_intent_id is read-only';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_links_protect_settlement_fields_trg on public.payment_links;
create trigger payment_links_protect_settlement_fields_trg
  before update of status, paid_at, paid_payment_intent_id
  on public.payment_links
  for each row
  execute function public.payment_links_protect_settlement_fields();

-- ── amount sanity constraints (invoices) ──────────────────────────
-- total_cents already has CHECK (>= 0); subtotal/tax/refund did not.
-- Verified no existing rows violate these before adding.
alter table public.invoices
  add constraint invoices_subtotal_cents_nonneg check (subtotal_cents >= 0) not valid;
alter table public.invoices validate constraint invoices_subtotal_cents_nonneg;

alter table public.invoices
  add constraint invoices_tax_cents_nonneg check (tax_cents >= 0) not valid;
alter table public.invoices validate constraint invoices_tax_cents_nonneg;

alter table public.invoices
  add constraint invoices_refunded_amount_nonneg check (refunded_amount_cents >= 0) not valid;
alter table public.invoices validate constraint invoices_refunded_amount_nonneg;
