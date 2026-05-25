-- Full lockdown of vendor_profiles.payment_handles +
-- stripe_account_id. PR #863 closed the anon column-grant gap;
-- this closes the authenticated one too.
--
-- The data is sensitive (Venmo handle = tied to a real phone, Cash
-- App = bank-linked, Zelle = email/phone) so a random authenticated
-- account shouldn't be able to scrape every vendor's payment info
-- by listing the table. Postgres RLS is row-level only, so we can't
-- express "row visible but two columns masked" directly — instead:
--
--   1. REVOKE column-level SELECT from authenticated entirely.
--      Direct table queries (including the JOIN that
--      HostInquiryDetailPage was using) can no longer read these
--      columns.
--   2. Add a SECURITY DEFINER RPC that returns the same fields
--      only when the caller has a legitimate reason to see them:
--      they own the vendor profile, OR they're the host on an
--      inquiry with that vendor (i.e., they're about to pay them).
--   3. Both the vendor's own Integrations page AND the host's
--      inquiry detail page call the RPC instead of joining
--      directly.
--
-- The owner-read path through the RPC is necessary because the
-- column-level REVOKE applies to every authenticated caller —
-- even the row owner. RLS doesn't compose with column grants the
-- way you'd want.

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

  select vp.stripe_account_id, coalesce(vp.payment_handles, '{}'::jsonb)
    into v_stripe_account_id, v_payment_handles
    from public.vendor_profiles vp
    where vp.id = p_vendor_id;

  return jsonb_build_object(
    'stripe_account_id', v_stripe_account_id,
    'payment_handles', coalesce(v_payment_handles, '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.get_vendor_payment_info(uuid)
  from public, anon;
grant execute on function public.get_vendor_payment_info(uuid)
  to authenticated;

revoke select (payment_handles, stripe_account_id)
  on public.vendor_profiles
  from authenticated;
