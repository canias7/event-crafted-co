-- log_admin_action self-gates on is_admin() internally — non-admins
-- silently no-op. Grant EXECUTE back so the admin UI (which runs as
-- the authenticated role) can call it. Previously revoked by the
-- bulk lockdown migration (20260511162000_revoke_internal_function_execute.sql)
-- which was overly broad for this particular RPC.

grant execute on function public.log_admin_action(text, text, uuid, text, jsonb)
  to authenticated;
