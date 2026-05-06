-- The DELETE RLS policy added in 20260508000000 should let owners
-- remove their own vendor_profiles row, but on at least one
-- environment that policy never made it onto the live database, so
-- the dashboard's Delete button silently no-ops (.delete() returns
-- success with zero rows affected). This RPC is the belt to that
-- suspenders: a SECURITY DEFINER function that performs the delete
-- with its own ownership check, so it works regardless of whether
-- the policy is in place.

create or replace function public.delete_my_vendor_profile(p_vendor_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owns boolean;
begin
  -- Caller must either own the row directly or be an owner/admin
  -- team member of the vendor. Anything else aborts with a
  -- permission-denied error so the UI can surface it clearly.
  select exists (
    select 1
    from public.vendor_profiles vp
    where vp.id = p_vendor_id
      and (
        vp.user_id = auth.uid()
        or exists (
          select 1
          from public.vendor_team_members vtm
          where vtm.vendor_id = vp.id
            and vtm.user_id = auth.uid()
            and vtm.role in ('owner', 'admin')
        )
      )
  ) into v_owns;

  if not v_owns then
    raise exception 'You do not have permission to delete this listing'
      using errcode = '42501';
  end if;

  delete from public.vendor_profiles where id = p_vendor_id;
  return true;
end;
$$;

grant execute on function public.delete_my_vendor_profile(uuid)
  to authenticated;
