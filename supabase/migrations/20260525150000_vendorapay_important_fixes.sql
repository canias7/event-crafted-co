-- Audit IMPORTANT fixes #9, #10, #11, #13.

-- #9: Snapshot tier + fee at send-time so a vendor changing plans
-- mid-flight doesn't silently re-quote.
alter table public.payment_links
  add column if not exists vendor_tier_snapshot text,
  add column if not exists platform_fee_cents_snapshot integer;

alter table public.invoices
  add column if not exists vendor_tier_snapshot text,
  add column if not exists platform_fee_cents_snapshot integer;

-- #10: Let the public checkout RPCs return paid/cancelled/expired
-- rows too, so the page can show informative states instead of a
-- generic "not found" that looks like vendor fraud.
create or replace function public.get_payment_link_for_checkout(p_slug text)
returns table (
  id uuid,
  vendor_id uuid,
  title text,
  description text,
  amount_cents integer,
  currency text,
  status text,
  vendor_business_name text,
  vendor_logo_url text
) language sql stable security definer set search_path = public as $$
  select pl.id, pl.vendor_id, pl.title, pl.description, pl.amount_cents,
    pl.currency, pl.status, vp.business_name, vp.logo_url
  from public.payment_links pl
  join public.vendor_profiles vp on vp.id = pl.vendor_id
  where pl.slug = p_slug
  limit 1;
$$;

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
  currency text,
  status text,
  vendor_business_name text,
  vendor_logo_url text
) language sql stable security definer set search_path = public as $$
  select i.id, i.vendor_id, i.invoice_number, i.bill_to_name, i.bill_to_email,
    i.issue_date, i.due_date, i.notes, i.line_items, i.subtotal_cents,
    i.tax_rate_bps, i.tax_cents, i.total_cents, i.currency, i.status,
    vp.business_name, vp.logo_url
  from public.invoices i
  join public.vendor_profiles vp on vp.id = i.vendor_id
  where i.slug = p_slug
  limit 1;
$$;

-- #11: Cancelling a parent (deposit) link now cascades the cancel
-- to its scheduled children (balance link).
create or replace function public.payment_links_cascade_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'cancelled' and new.status = 'cancelled' then
    update public.payment_links
      set status = 'cancelled', updated_at = now()
      where parent_link_id = new.id and status in ('scheduled', 'active');
  end if;
  return new;
end;
$$;

drop trigger if exists payment_links_cascade_cancel_trg on public.payment_links;
create trigger payment_links_cascade_cancel_trg
  after update of status on public.payment_links
  for each row execute function public.payment_links_cascade_cancel();

-- Snapshot triggers for #9.
create or replace function public.payment_links_snapshot_tier()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vendor_tier_snapshot is null then
    new.vendor_tier_snapshot := coalesce(
      public.get_vendor_subscription_tier(new.vendor_id),
      'free'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists payment_links_snapshot_tier_trg on public.payment_links;
create trigger payment_links_snapshot_tier_trg
  before insert on public.payment_links
  for each row execute function public.payment_links_snapshot_tier();

create or replace function public.invoices_snapshot_tier_on_send()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.status is distinct from 'sent') and new.status = 'sent'
     and new.vendor_tier_snapshot is null then
    new.vendor_tier_snapshot := coalesce(
      public.get_vendor_subscription_tier(new.vendor_id),
      'free'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_snapshot_tier_on_send_trg on public.invoices;
create trigger invoices_snapshot_tier_on_send_trg
  before update of status on public.invoices
  for each row execute function public.invoices_snapshot_tier_on_send();

create or replace function public.invoices_snapshot_tier_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'sent' and new.vendor_tier_snapshot is null then
    new.vendor_tier_snapshot := coalesce(
      public.get_vendor_subscription_tier(new.vendor_id),
      'free'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_snapshot_tier_on_insert_trg on public.invoices;
create trigger invoices_snapshot_tier_on_insert_trg
  before insert on public.invoices
  for each row execute function public.invoices_snapshot_tier_on_insert();
