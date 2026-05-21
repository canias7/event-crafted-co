-- OAuth 2.1 for the Vendora MCP connector. Three tables:
--
-- oauth_clients         — registered Claude clients (DCR or manual).
-- oauth_auth_codes      — short-lived (60s) one-time codes from
--                         the authorization endpoint, PKCE-bound.
-- oauth_access_tokens   — opaque bearer tokens + refresh tokens.
--
-- All three are service-role-only (no RLS exposure to clients).
-- The edge functions under supabase/functions/mcp-oauth-* hold the
-- only keys and validate hashes here.

create table public.oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  client_secret_hash text not null,
  client_name text,
  redirect_uris text[] not null,
  token_endpoint_auth_method text not null default 'client_secret_post',
  created_at timestamptz not null default now()
);

create table public.oauth_auth_codes (
  code_hash text primary key,
  client_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_challenge text not null,
  code_challenge_method text not null check (code_challenge_method = 'S256'),
  redirect_uri text not null,
  scope text not null default 'vendora',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index oauth_auth_codes_expires_idx
  on public.oauth_auth_codes (expires_at);

create table public.oauth_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  refresh_token_hash text not null unique,
  client_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'vendora',
  expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index oauth_access_tokens_user_idx
  on public.oauth_access_tokens (user_id, created_at desc);

alter table public.oauth_clients enable row level security;
alter table public.oauth_auth_codes enable row level security;
alter table public.oauth_access_tokens enable row level security;

-- Users can see their own active tokens (so the panel can list and
-- revoke). Edge functions use the service role and bypass RLS.
create policy "oauth_access_tokens select own"
  on public.oauth_access_tokens for select to authenticated
  using (user_id = auth.uid());

create policy "oauth_access_tokens revoke own"
  on public.oauth_access_tokens for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
