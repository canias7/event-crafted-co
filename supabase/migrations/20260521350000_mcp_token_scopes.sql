-- Per-token scopes for the MCP server.
--
-- Today every PAT and OAuth access token can call every MCP tool.
-- After this migration, tokens are scoped to either:
--   - 'read_write' (default) — same as before, all 12 tools
--   - 'read_only' — only the 5 read tools, write tools 403
--
-- Existing rows get 'read_write' so nothing breaks.

alter table public.vendor_access_tokens
  add column if not exists scope text not null default 'read_write'
  check (scope in ('read_only', 'read_write'));

alter table public.oauth_access_tokens
  drop constraint if exists oauth_access_tokens_scope_check;
alter table public.oauth_access_tokens
  alter column scope drop default;
alter table public.oauth_access_tokens
  alter column scope set default 'read_write';
update public.oauth_access_tokens
  set scope = 'read_write'
  where scope = 'vendora';
alter table public.oauth_access_tokens
  add constraint oauth_access_tokens_scope_check
  check (scope in ('read_only', 'read_write'));

-- Re-create the mint RPC to accept a scope parameter.
create or replace function public.create_vendor_access_token(
  p_name text default null,
  p_scope text default 'read_write'
)
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
  if p_scope not in ('read_only', 'read_write') then
    raise exception 'invalid_scope: %', p_scope;
  end if;

  v_plain := 'vdr_' || encode(gen_random_bytes(32), 'base64');
  v_plain := replace(replace(replace(v_plain, '+', '-'), '/', '_'), '=', '');
  v_hash := encode(digest(v_plain, 'sha256'), 'hex');
  v_prefix := substring(v_plain from 1 for 12);

  insert into public.vendor_access_tokens (user_id, token_hash, token_prefix, name, scope)
  values (v_user, v_hash, v_prefix, p_name, p_scope)
  returning vendor_access_tokens.id into v_id;

  return query select v_id, v_plain;
end;
$$;

revoke execute on function public.create_vendor_access_token(text, text) from public, anon;
grant execute on function public.create_vendor_access_token(text, text) to authenticated;
