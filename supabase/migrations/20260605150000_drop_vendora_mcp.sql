-- Drop the Vendora MCP connector's backing tables + RPC.
--
-- The outbound MCP server (vendora-mcp) and its OAuth flow
-- (mcp-oauth-*) were deleted in code — My Space's in-app AI makes the
-- external connector redundant. This removes the data that only the
-- connector used. Nothing else references these objects (verified: no
-- FKs from kept tables, and my-space-chat / vendor-stripe-mcp-connect
-- don't touch them).
--
-- KEPT (not part of this connector): my_space_custom_tools (used by the
-- in-app chatbox), profiles.stripe_mcp_api_key + vendor-stripe-mcp-connect
-- (My Space calling Stripe's MCP), and _shared/hilux-prompt.ts.

-- PAT-minting RPC (all overloads).
do $$
declare
  r record;
begin
  for r in
    select oid::regprocedure as sig
    from pg_proc
    where proname = 'create_vendor_access_token'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- Connector tables. CASCADE clears the OAuth FK chain + any policies.
drop table if exists public.oauth_auth_codes cascade;
drop table if exists public.oauth_access_tokens cascade;
drop table if exists public.oauth_clients cascade;
drop table if exists public.mcp_call_log cascade;
drop table if exists public.vendor_access_tokens cascade;
