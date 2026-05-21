-- Vendora MCP server: Personal Access Tokens table.
--
-- Vendors generate a token in /vendor/super-agents and paste it
-- into their Claude client (Claude.ai / Claude Code / Cursor) when
-- adding the Vendora MCP connector. The token authenticates every
-- MCP call this vendor's Claude client makes.
--
-- We store only a SHA-256 hash of the token; the plaintext is only
-- ever returned once at creation. Each token is scoped to a single
-- user; the MCP server enforces row-ownership on every tool call.
--
-- V1 design choice: PAT instead of OAuth 2.1. OAuth is the proper
-- long-term answer, but PATs ship faster, are easier to debug, and
-- match how most other MCP servers (Sentry, Stripe, etc.) first
-- exposed themselves before adding OAuth. Migration to OAuth later
-- is additive — we keep PATs as a power-user option.

create table public.vendor_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- SHA-256 hex digest of the plaintext token. We never store the
  -- plaintext; the value is shown to the vendor exactly once on
  -- create, then they must save it elsewhere.
  token_hash text not null unique,
  -- Short prefix (first 8 chars) shown in the UI so the vendor can
  -- identify tokens in their list without revealing the secret.
  token_prefix text not null,
  -- Optional human label set by the vendor ("My MacBook", "Claude on
  -- the iPad", etc.).
  name text,
  -- Bumped by the MCP server on every successful auth so vendors
  -- can spot stale tokens.
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index vendor_access_tokens_user_idx
  on public.vendor_access_tokens (user_id, created_at desc);

alter table public.vendor_access_tokens enable row level security;

-- Vendors only see / manage their own tokens. Token plaintext is
-- never readable from this table — only the prefix + hash + metadata.
create policy "vendor_access_tokens select own"
  on public.vendor_access_tokens for select to authenticated
  using (user_id = auth.uid());

create policy "vendor_access_tokens insert own"
  on public.vendor_access_tokens for insert to authenticated
  with check (user_id = auth.uid());

create policy "vendor_access_tokens delete own"
  on public.vendor_access_tokens for delete to authenticated
  using (user_id = auth.uid());

-- RPC: mint a new token. Returns the plaintext exactly once. We
-- generate the token server-side so the entropy source is the
-- Postgres CSPRNG rather than client-side randomness, and the hash
-- never leaves the database.
create or replace function public.create_vendor_access_token(p_name text default null)
returns table (id uuid, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plain text;
  v_hash text;
  v_prefix text;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  -- 32 random bytes, base64url-encoded, prefixed for legibility.
  v_plain := 'vdr_' || encode(gen_random_bytes(32), 'base64');
  -- Strip base64 padding + sub-in url-safe alphabet so the token
  -- survives URL contexts and looks tidy when pasted.
  v_plain := replace(replace(replace(v_plain, '+', '-'), '/', '_'), '=', '');
  v_hash := encode(digest(v_plain, 'sha256'), 'hex');
  v_prefix := substring(v_plain from 1 for 12);

  insert into public.vendor_access_tokens (user_id, token_hash, token_prefix, name)
  values (v_user, v_hash, v_prefix, p_name)
  returning vendor_access_tokens.id into v_id;

  return query select v_id, v_plain;
end;
$$;

revoke execute on function public.create_vendor_access_token(text) from public, anon;
grant execute on function public.create_vendor_access_token(text) to authenticated;

-- Ensure the digest function from pgcrypto is available.
create extension if not exists pgcrypto;
