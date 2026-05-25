-- Audit follow-up to PR #882. The same broken column-level REVOKE
-- pattern affected vendor_profiles.payment_handles + stripe_account_id
-- from PRs #863/#864 — those REVOKEs silently no-op'd and the columns
-- were readable by any authenticated user under vendor_profiles' RLS
-- (which allows reading any approved listing). Same fix:
-- move the sensitive columns to a side table with no client RLS access.
--
-- payment_handles holds Venmo/CashApp/PayPal/Zelle handles + Zelle
-- email/phone. stripe_account_id is the vendor's Connect account ID.
-- Both belong out of the public read path.

create table if not exists public.vendor_payment_secrets (
  vendor_id uuid primary key references public.vendor_profiles(id) on delete cascade,
  payment_handles jsonb not null default '{}'::jsonb,
  stripe_account_id text,
  updated_at timestamptz not null default now()
);

alter table public.vendor_payment_secrets enable row level security;
-- No policies → all client roles denied entirely.

revoke all on public.vendor_payment_secrets from public, anon, authenticated;
grant all on public.vendor_payment_secrets to service_role;

-- Copy data over.
insert into public.vendor_payment_secrets (vendor_id, payment_handles, stripe_account_id)
select id, coalesce(payment_handles, '{}'::jsonb), stripe_account_id
from public.vendor_profiles
on conflict (vendor_id) do nothing;

-- Repoint the unique index that PR #863 put on stripe_account_id —
-- we still want one Stripe account per row, just on the new table.
create unique index if not exists vendor_payment_secrets_stripe_account_idx
  on public.vendor_payment_secrets (stripe_account_id)
  where stripe_account_id is not null;

-- Drop the original columns. The vendor_profiles_stripe_account_idx
-- index gets dropped automatically with the column.
alter table public.vendor_profiles
  drop column if exists payment_handles,
  drop column if exists stripe_account_id;

-- Repoint get_vendor_payment_info at the new table. Same gating:
-- caller is vendor team member (owner read), OR caller has an
-- inquiry with this vendor (host who needs to pay).
create or replace function public.get_vendor_payment_info(
  p_vendor_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_can_see boolean := false;
  v_stripe_account_id text;
  v_payment_handles jsonb;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    return jsonb_build_object(
      'stripe_account_id', null,
      'payment_handles', '{}'::jsonb
    );
  end if;

  v_can_see := public.is_vendor_member(p_vendor_id);
  if not v_can_see then
    v_can_see := exists(
      select 1 from public.inquiries i
      where i.vendor_id = p_vendor_id
        and i.host_id = v_caller
    );
  end if;
  if not v_can_see then
    return jsonb_build_object(
      'stripe_account_id', null,
      'payment_handles', '{}'::jsonb
    );
  end if;

  select s.stripe_account_id, coalesce(s.payment_handles, '{}'::jsonb)
    into v_stripe_account_id, v_payment_handles
    from public.vendor_payment_secrets s
    where s.vendor_id = p_vendor_id;

  return jsonb_build_object(
    'stripe_account_id', v_stripe_account_id,
    'payment_handles', coalesce(v_payment_handles, '{}'::jsonb)
  );
end;
$$;

-- New write RPC for the owner-only handle update. Replaces the
-- direct .from('vendor_profiles').update({payment_handles}) call
-- that VendorIntegrationsPage used to make — that path no longer
-- works since the column is gone.
create or replace function public.set_vendor_payment_handles(
  p_vendor_id uuid,
  p_handles jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  if not public.is_vendor_member(p_vendor_id) then
    raise exception 'not a member of this vendor';
  end if;
  insert into public.vendor_payment_secrets (vendor_id, payment_handles, updated_at)
  values (p_vendor_id, coalesce(p_handles, '{}'::jsonb), now())
  on conflict (vendor_id) do update
    set payment_handles = excluded.payment_handles,
        updated_at = now();
end;
$$;

revoke execute on function public.set_vendor_payment_handles(uuid, jsonb)
  from public, anon;
grant execute on function public.set_vendor_payment_handles(uuid, jsonb)
  to authenticated;
