-- One-shot bootstrap: grant the founder admin role.
-- Idempotent — no-op if the user doesn't exist or is already admin.
-- Safe to leave in migration history as the first-owner setup.

update public.profiles
set role = 'admin'
where role <> 'admin'
  and id = (select id from auth.users where email = 'founder@eventvendora.com');
