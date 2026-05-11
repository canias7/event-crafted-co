-- The previous revoke-sweep was too aggressive on the three admin
-- RPCs that the admin web app actually calls from the browser. The
-- admin app signs in as a normal Supabase user (role = authenticated)
-- and the function bodies already gate on is_admin(), so it's safe
-- to expose EXECUTE to authenticated — the linter flag is by design
-- for these three.

grant execute on function public.admin_delete_user(p_user_id uuid)
  to authenticated;
grant execute on function public.admin_list_users()
  to authenticated;
grant execute on function public.admin_list_vendor_applications(p_status text)
  to authenticated;
