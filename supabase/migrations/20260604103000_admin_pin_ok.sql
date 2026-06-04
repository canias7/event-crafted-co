-- PIN check for the admin-session edge function, mirroring cron_secret_ok.
-- Reads the Vault-backed 'admin_pin' secret and compares (SECURITY DEFINER,
-- service-role only). Returns:
--   NULL  -> no admin_pin secret configured (function reports "not configured")
--   true  -> provided PIN matches
--   false -> provided PIN doesn't match
--
-- The PIN VALUE itself is intentionally NOT in this migration — it lives only
-- in Vault (set out of band via:
--   select vault.create_secret('<pin>', 'admin_pin', 'Admin panel login PIN');
-- ) so it never lands in git.
create or replace function public.admin_pin_ok(provided text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when (select count(*) = 0 from vault.decrypted_secrets where name = 'admin_pin') then null
    else provided = (select decrypted_secret from vault.decrypted_secrets where name = 'admin_pin' limit 1)
  end;
$function$;

revoke all on function public.admin_pin_ok(text) from public;
grant execute on function public.admin_pin_ok(text) to service_role;
