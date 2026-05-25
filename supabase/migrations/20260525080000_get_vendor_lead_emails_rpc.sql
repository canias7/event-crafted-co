-- RPC that returns the email addresses of hosts who've inquired with
-- a vendor — used by the Leads page to render the EMAIL column.
-- Email lives in auth.users, which isn't readable via RLS, so a
-- SECURITY DEFINER RPC is the only client-side path.
--
-- Gating: caller must be a vendor team member on the vendor_id, AND
-- we only return emails for hosts that have at least one inquiry
-- with that vendor (existing business relationship).

create or replace function public.get_vendor_lead_emails(
  p_vendor_id uuid
) returns table (host_id uuid, email text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if not public.is_vendor_member(p_vendor_id) then
    return;
  end if;
  return query
    select distinct i.host_id, u.email::text
    from public.inquiries i
    join auth.users u on u.id = i.host_id
    where i.vendor_id = p_vendor_id;
end;
$$;

revoke execute on function public.get_vendor_lead_emails(uuid) from public, anon;
grant execute on function public.get_vendor_lead_emails(uuid) to authenticated;
