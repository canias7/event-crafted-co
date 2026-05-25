-- Track Stripe Connect onboarding state on vendor_payment_secrets so
-- the host-pay flow can tell "Connect button clicked but KYC abandoned"
-- apart from "fully onboarded." The original stripe-create-checkout
-- code checked a vendor_profiles.stripe_charges_enabled column that
-- didn't exist — that's why it kept silently breaking until PR #883's
-- audit (the function returned 'vendor has not finished onboarding'
-- because the JOIN returned undefined for the missing column).
--
-- Source of truth is Stripe's account.updated webhook event, now
-- handled in stripe-webhook.

alter table public.vendor_payment_secrets
  add column if not exists charges_enabled boolean not null default false,
  add column if not exists payouts_enabled boolean not null default false,
  add column if not exists details_submitted boolean not null default false;

-- Surface charges_enabled on the read RPC so the Integrations page
-- can show "Pending KYC" vs "Connected & ready to charge" instead
-- of a single "Connected" pill that hides the pre-KYC state.
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
  v_charges_enabled boolean := false;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    return jsonb_build_object(
      'stripe_account_id', null,
      'payment_handles', '{}'::jsonb,
      'stripe_charges_enabled', false
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
      'payment_handles', '{}'::jsonb,
      'stripe_charges_enabled', false
    );
  end if;

  select
    s.stripe_account_id,
    coalesce(s.payment_handles, '{}'::jsonb),
    coalesce(s.charges_enabled, false)
  into v_stripe_account_id, v_payment_handles, v_charges_enabled
  from public.vendor_payment_secrets s
  where s.vendor_id = p_vendor_id;

  return jsonb_build_object(
    'stripe_account_id', v_stripe_account_id,
    'payment_handles', coalesce(v_payment_handles, '{}'::jsonb),
    'stripe_charges_enabled', coalesce(v_charges_enabled, false)
  );
end;
$$;

-- Owner-only RPC to drop the Stripe Connect reference. Doesn't
-- deauthorize the Stripe account itself (Express accounts can't be
-- deleted; the account stays in Stripe's dashboard) — it just
-- clears Vendora's pointer so the vendor can re-Connect with a
-- different Stripe account if they want.
create or replace function public.disconnect_my_stripe_connect(
  p_vendor_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  if not public.is_vendor_team_admin(p_vendor_id) then
    raise exception 'vendor admin role required';
  end if;
  update public.vendor_payment_secrets
  set stripe_account_id = null,
      charges_enabled = false,
      payouts_enabled = false,
      details_submitted = false,
      updated_at = now()
  where vendor_id = p_vendor_id;
end;
$$;

revoke execute on function public.disconnect_my_stripe_connect(uuid) from public, anon;
grant execute on function public.disconnect_my_stripe_connect(uuid) to authenticated;
