-- Audit hardening for contract e-signing.
--
-- The RLS policy on vendor_contracts is a blanket ALL (is_vendor_member), and
-- authenticated held INSERT/UPDATE on every column. That let a vendor member
-- forge a signature by writing the signing columns directly (UPDATE
-- status='signed' / signer_name / signature_image / verified_email, or
-- re-pointing recipient_email to their own inbox) — bypassing the OTP
-- recipient-binding entirely. RLS is row-level, so we restrict at the column
-- level instead.
--
-- Clients may only insert the fields the app legitimately supplies. status,
-- sign_token, recipient_email and all signature columns are set by defaults /
-- the SECURITY DEFINER trigger and sign_contract RPC, which run as the table
-- owner and bypass these grants. No client UPDATE path exists, so UPDATE is
-- removed entirely.
revoke insert, update on public.vendor_contracts from authenticated, anon;
grant insert (vendor_id, inquiry_id, template_id, title, body, recipient_name)
  on public.vendor_contracts to authenticated;

-- Trigger functions shouldn't be reachable as PostgREST RPCs.
revoke execute on function public.tg_set_contract_recipient_email() from anon, authenticated, public;
