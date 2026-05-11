-- Tiny RPC so a signed-in user can peek at *another* user's most
-- recent device_push_tokens.last_seen_at without bypassing the
-- existing owner-only RLS on the table. Used by the mobile thread
-- screen's header to render the "Active now" / green-dot affordance.

create or replace function public.get_user_last_seen(p_user_id uuid)
returns timestamptz
language sql
security definer
stable
set search_path = public
as $$
  select max(last_seen_at) from public.device_push_tokens where user_id = p_user_id;
$$;

revoke execute on function public.get_user_last_seen(uuid) from public, anon;
grant execute on function public.get_user_last_seen(uuid) to authenticated;
