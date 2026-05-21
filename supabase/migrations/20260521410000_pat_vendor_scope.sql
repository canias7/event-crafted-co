-- Per-vendor scoping for personal access tokens. Vendors with
-- multiple listings can now mint a token that only operates on
-- one of them — Claude (or any MCP client using that token)
-- cannot read or write data for other vendors the user owns.
--
-- vendor_id NULL = the token sees every vendor the user owns
-- (unchanged behavior, default).

alter table public.vendor_access_tokens
  add column if not exists vendor_id uuid
    references public.vendor_profiles(id) on delete cascade;

create index if not exists vendor_access_tokens_vendor_idx
  on public.vendor_access_tokens (vendor_id)
  where vendor_id is not null;

-- Re-create the mint RPC to accept p_vendor_id. We verify the
-- caller actually owns the chosen vendor before binding the token.
create or replace function public.create_vendor_access_token(
  p_name text default null,
  p_scope text default 'read_write',
  p_vendor_id uuid default null
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
  v_owns boolean;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_scope not in ('read_only', 'read_write') then
    raise exception 'invalid_scope: %', p_scope;
  end if;
  if p_vendor_id is not null then
    select exists (
      select 1 from public.vendor_team_members vtm
      where vtm.vendor_id = p_vendor_id and vtm.user_id = v_user
    ) into v_owns;
    if not v_owns then
      raise exception 'not_your_vendor: %', p_vendor_id;
    end if;
  end if;

  v_plain := 'vdr_' || encode(gen_random_bytes(32), 'base64');
  v_plain := replace(replace(replace(v_plain, '+', '-'), '/', '_'), '=', '');
  v_hash := encode(digest(v_plain, 'sha256'), 'hex');
  v_prefix := substring(v_plain from 1 for 12);

  insert into public.vendor_access_tokens
    (user_id, token_hash, token_prefix, name, scope, vendor_id)
  values
    (v_user, v_hash, v_prefix, p_name, p_scope, p_vendor_id)
  returning vendor_access_tokens.id into v_id;

  return query select v_id, v_plain;
end;
$$;

revoke execute on function public.create_vendor_access_token(text, text, uuid) from public, anon;
grant execute on function public.create_vendor_access_token(text, text, uuid) to authenticated;
