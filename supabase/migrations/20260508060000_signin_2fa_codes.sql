-- Email-code 2FA on top of password sign-in. The flow:
--   1. Client submits email + password
--   2. signin-2fa edge function verifies password against
--      auth.users.encrypted_password, generates a 6-digit code, stores
--      its hash + expires_at + email, sends the code via Resend.
--   3. Client submits email + code
--   4. Edge function checks the hash matches and isn't expired or used,
--      marks it used, returns ok.
--   5. Client calls signInWithPassword to actually establish the session.

create table if not exists public.signin_2fa_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  attempts smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists signin_2fa_codes_email_idx
  on public.signin_2fa_codes (lower(email), created_at desc);

alter table public.signin_2fa_codes enable row level security;
revoke all on public.signin_2fa_codes from anon, authenticated;

-- Helper: verify a password matches what's stored in auth.users for an
-- email. Uses pgcrypto's crypt(plaintext, hash) — auth.users uses bcrypt
-- which crypt() supports natively. SECURITY DEFINER so the edge function
-- can call it without direct auth.users access.
create or replace function public.verify_user_password(p_email text, p_password text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
declare
  uid uuid;
begin
  select id into uid
  from auth.users
  where lower(email) = lower(p_email)
    and encrypted_password = crypt(p_password, encrypted_password)
    and (banned_until is null or banned_until <= now());
  return uid;
end;
$$;

revoke all on function public.verify_user_password(text, text) from public, anon, authenticated;
grant execute on function public.verify_user_password(text, text) to service_role;
