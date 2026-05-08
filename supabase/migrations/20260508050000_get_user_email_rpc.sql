-- Helper RPC for edge functions / admin tools that need to look up
-- the email of a user by id. Service-role only — locked down so
-- regular authenticated callers can't enumerate emails.
create or replace function public.get_user_email(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select email::text from auth.users where id = p_user_id;
$$;

revoke all on function public.get_user_email(uuid) from public, anon, authenticated;
grant execute on function public.get_user_email(uuid) to service_role;
