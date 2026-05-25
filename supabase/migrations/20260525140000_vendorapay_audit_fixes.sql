-- Audit fix #1: tier lookup. The live subscription_tier moved from
-- vendor_profiles to profiles (per-user) in migration 20260524000000.
-- Charge paths were reading the dead column on vendor_profiles —
-- every Pro/Studio vendor got billed at the Free/Starter rate.
--
-- This RPC is the single source of truth; the three charge edge
-- functions call it instead of selecting subscription_tier directly.
create or replace function public.get_vendor_subscription_tier(p_vendor_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(p.subscription_tier, 'free')
  from public.vendor_profiles vp
  join public.profiles p on p.id = vp.user_id
  where vp.id = p_vendor_id;
$$;

grant execute on function public.get_vendor_subscription_tier(uuid) to authenticated, anon;

-- Audit fix #4: charge.refunded webhook needs to update pay_links
-- and invoices too. Expand the status check constraints so the
-- refund path can stamp those rows.
alter table public.payment_links
  drop constraint if exists payment_links_status_check;
alter table public.payment_links
  add constraint payment_links_status_check
  check (status in ('active', 'paid', 'cancelled', 'expired', 'scheduled', 'refunded', 'partial_refund'));

alter table public.invoices
  drop constraint if exists invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check
  check (status in ('draft', 'sent', 'paid', 'cancelled', 'overdue', 'refunded', 'partial_refund'));
