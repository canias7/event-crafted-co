-- verify_user_password used to return uuid (uid or null), but the
-- signin-2fa edge function needs to distinguish "wrong password" from
-- "password OK but the account is banned" (e.g. a vendor whose
-- application is still pending). Replace with a richer jsonb payload.

drop function if exists public.verify_user_password(text, text);

create or replace function public.verify_user_password(p_email text, p_password text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  u_id uuid;
  u_banned timestamptz;
begin
  select id, banned_until into u_id, u_banned
  from auth.users
  where lower(email) = lower(p_email)
    and encrypted_password = crypt(p_password, encrypted_password);

  if u_id is null then
    return jsonb_build_object('status', 'invalid_credentials');
  end if;
  if u_banned is not null and u_banned > now() then
    return jsonb_build_object('status', 'banned', 'user_id', u_id);
  end if;
  return jsonb_build_object('status', 'ok', 'user_id', u_id);
end;
$$;

revoke all on function public.verify_user_password(text, text) from public, anon, authenticated;
grant execute on function public.verify_user_password(text, text) to service_role;
