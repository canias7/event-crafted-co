-- Stripe AI access — lets the vendor's in-app My Space AI call
-- Stripe's official MCP server on the vendor's behalf. Per Phase 0
-- of the rollout, vendors paste a Stripe Restricted API key into
-- Vendora; we store it (column-level revoke, only the edge function
-- with service_role can read), and forward it to Anthropic's Messages
-- API as the bearer token on the mcp_servers parameter pointing at
-- https://mcp.stripe.com/.
--
-- Future Phase 1: replace the paste flow with a real OAuth dance.

alter table public.profiles
  add column if not exists stripe_mcp_api_key text,
  add column if not exists stripe_mcp_key_last4 text,
  add column if not exists stripe_mcp_connected_at timestamptz;

-- The key itself is sensitive — same pattern as stripe_account_id
-- and payment_handles: REVOKE the column-level SELECT from any
-- client role. The edge function reaches it via service_role.
revoke select (stripe_mcp_api_key) on public.profiles from authenticated, anon;

-- Status RPC the UI calls to render connection state without ever
-- pulling the key itself. Returns connected boolean + last4 (for
-- display) + connected_at.
create or replace function public.get_my_stripe_mcp_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_last4 text;
  v_connected_at timestamptz;
  v_has_key boolean;
begin
  if v_uid is null then
    return jsonb_build_object('connected', false);
  end if;
  select
    stripe_mcp_api_key is not null,
    stripe_mcp_key_last4,
    stripe_mcp_connected_at
  into v_has_key, v_last4, v_connected_at
  from public.profiles
  where id = v_uid;

  return jsonb_build_object(
    'connected', coalesce(v_has_key, false),
    'last4', v_last4,
    'connected_at', v_connected_at
  );
end;
$$;

revoke execute on function public.get_my_stripe_mcp_status() from public, anon;
grant execute on function public.get_my_stripe_mcp_status() to authenticated;

-- Disconnect RPC — owner-only, just nulls the columns.
create or replace function public.disconnect_my_stripe_mcp()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  update public.profiles
  set stripe_mcp_api_key = null,
      stripe_mcp_key_last4 = null,
      stripe_mcp_connected_at = null
  where id = auth.uid();
end;
$$;

revoke execute on function public.disconnect_my_stripe_mcp() from public, anon;
grant execute on function public.disconnect_my_stripe_mcp() to authenticated;
