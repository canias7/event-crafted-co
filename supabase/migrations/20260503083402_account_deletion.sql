-- Self-service account deletion. Deletes the profile row; cascades clean up
-- vendor_profiles, inquiries, messages, reviews, saved_vendors, etc. via FKs.
-- The auth.users row is left orphaned (we can't drop it from a regular RPC
-- without elevated grants); next time the user attempts to sign in, no
-- profile exists so RequireRole bounces them. The admin can periodically
-- prune orphaned auth.users rows. Privacy policy commits to a 30-day SLA
-- which is consistent with this lazy cleanup.

create or replace function public.request_account_deletion()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from public.profiles where id = auth.uid();
end$$;

revoke execute on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;
