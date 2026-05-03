-- Restore EXECUTE on helper SECURITY DEFINER functions used by RLS policies.
-- The previous migration revoked these from `authenticated`, which silently
-- broke RLS for vendors: Postgres still checks EXECUTE on a function called
-- from a policy, so vendor SELECT/UPDATE on inquiries and messages would
-- always evaluate the policy clause to false. The functions themselves only
-- compare auth.uid() against owner columns, so re-granting is safe.

grant execute on function public.is_vendor_owner(uuid) to authenticated;
grant execute on function public.can_access_inquiry(uuid) to authenticated;
