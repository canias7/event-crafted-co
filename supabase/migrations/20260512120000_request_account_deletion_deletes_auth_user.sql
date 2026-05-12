-- request_account_deletion used to only DELETE from public.profiles,
-- leaving the auth.users row behind. That meant a "deleted" account
-- couldn't sign back up with the same email (auth said it was taken)
-- and various FKs pointing at auth.users.id were orphaned.
--
-- Cascade chain that fires when auth.users is deleted (verified via
-- pg_constraint): profiles, vendor_team_members, vendor_profiles
-- (via profiles), direct_threads, direct_messages, thread_mutes,
-- host_verification_requests, device_push_tokens, mood_boards,
-- vendor_posts/reels/buzz, planning_*, saved_searches, etc.
-- A handful of audit-style columns (reviewer_id, application_reviewed_by,
-- thread_reports.reporter_id, content_reports.resolved_by) have
-- ON DELETE SET NULL so the historical record persists with a null
-- user reference.

create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = public, auth
as $function$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Not signed in'; end if;
  delete from auth.users where id = v_uid;
end$function$;

-- User-callable RPC: needs authenticated access (anon stays blocked).
revoke execute on function public.request_account_deletion()
  from public, anon, service_role;
grant  execute on function public.request_account_deletion() to authenticated;
