-- M1/M2 activation: validate the cron shared-secret against Vault so the
-- edge functions need no env var (single source of truth, no rollout race).
-- Returns true (allow) when no 'cron_secret' is configured (dormant), else
-- true only when the provided value matches. service_role only, so it's not
-- a brute-force oracle for anon/authenticated callers.
create or replace function public.cron_secret_ok(provided text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    provided = (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1),
    (select count(*) = 0 from vault.decrypted_secrets where name = 'cron_secret')
  );
$$;
revoke execute on function public.cron_secret_ok(text) from public;
grant execute on function public.cron_secret_ok(text) to service_role;
