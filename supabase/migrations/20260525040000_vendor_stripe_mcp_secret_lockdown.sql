-- Audit found that the column-level REVOKE on profiles.stripe_mcp_api_key
-- never took effect: PostgreSQL only honors column-level REVOKE when an
-- explicit column-level GRANT exists; with only the table-level grant,
-- REVOKE silently no-ops. RLS was therefore the only protection.
-- And RLS on profiles allows reads not just by the owner but by any
-- inquiry/thread counterparty (so a host could SELECT their vendor's
-- Stripe key after a single inquiry).
--
-- Fix: move the key to a dedicated table with NO RLS policies and
-- table-level grants revoked from anon + authenticated. Only the
-- service_role used by the edge functions can read or write.
-- The owner gets connection metadata (connected/last4/connected_at)
-- via the existing SECURITY DEFINER RPC.

create table if not exists public.vendor_stripe_mcp_secrets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  api_key text not null,
  last4 text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendor_stripe_mcp_secrets enable row level security;
-- Intentionally NO policies — client roles can never SELECT/INSERT/
-- UPDATE/DELETE. service_role bypasses RLS entirely.

revoke all on public.vendor_stripe_mcp_secrets from public, anon, authenticated;
grant all on public.vendor_stripe_mcp_secrets to service_role;

-- Migrate any data we already stored on profiles.* into the new
-- table. The columns get dropped below.
insert into public.vendor_stripe_mcp_secrets (user_id, api_key, last4, connected_at)
select id, stripe_mcp_api_key, coalesce(stripe_mcp_key_last4, right(stripe_mcp_api_key, 4)), coalesce(stripe_mcp_connected_at, now())
from public.profiles
where stripe_mcp_api_key is not null
on conflict (user_id) do nothing;

-- Drop the now-unused columns from profiles.
alter table public.profiles
  drop column if exists stripe_mcp_api_key,
  drop column if exists stripe_mcp_key_last4,
  drop column if exists stripe_mcp_connected_at;

-- Status RPC re-pointed at the new table. Returns metadata only;
-- never the key itself. SECURITY DEFINER lets it bypass the
-- no-policy lockdown.
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
  v_has_key boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('connected', false);
  end if;
  select true, last4, connected_at
  into v_has_key, v_last4, v_connected_at
  from public.vendor_stripe_mcp_secrets
  where user_id = v_uid;

  if not v_has_key then
    return jsonb_build_object('connected', false);
  end if;
  return jsonb_build_object(
    'connected', true,
    'last4', v_last4,
    'connected_at', v_connected_at
  );
end;
$$;

revoke execute on function public.get_my_stripe_mcp_status() from public, anon;
grant execute on function public.get_my_stripe_mcp_status() to authenticated;

-- Disconnect — delete the secret row.
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
  delete from public.vendor_stripe_mcp_secrets
  where user_id = auth.uid();
end;
$$;

revoke execute on function public.disconnect_my_stripe_mcp() from public, anon;
grant execute on function public.disconnect_my_stripe_mcp() to authenticated;
