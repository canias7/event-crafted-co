-- Extend verify_user_password to flag unconfirmed accounts.
--
-- Vendor applicants sign up with email_confirmed_at = null and only
-- get confirmed when admin approves (per
-- 20260508120000_vendor_confirm_at_approval). Until then, sign-in
-- isn't possible at all — but signin-2fa was happily emailing them a
-- 6-digit code anyway, then the eventual signInWithPassword would
-- fail with "Email not confirmed" after the user typed the code.
--
-- Add a 'not_confirmed' status so signin-2fa can short-circuit before
-- sending the code (and the client can show a "still under review"
-- message instead of pretending to send a code).

drop function if exists public.verify_user_password(text, text);

create or replace function public.verify_user_password(p_email text, p_password text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  u_id           uuid;
  u_banned       timestamptz;
  u_confirmed_at timestamptz;
begin
  select id, banned_until, email_confirmed_at
    into u_id, u_banned, u_confirmed_at
  from auth.users
  where lower(email) = lower(p_email)
    and encrypted_password = crypt(p_password, encrypted_password);

  if u_id is null then
    return jsonb_build_object('status', 'invalid_credentials');
  end if;
  if u_banned is not null and u_banned > now() then
    return jsonb_build_object('status', 'banned', 'user_id', u_id);
  end if;
  if u_confirmed_at is null then
    return jsonb_build_object('status', 'not_confirmed', 'user_id', u_id);
  end if;
  return jsonb_build_object('status', 'ok', 'user_id', u_id);
end;
$$;

revoke all on function public.verify_user_password(text, text) from public, anon, authenticated;
grant execute on function public.verify_user_password(text, text) to service_role;
