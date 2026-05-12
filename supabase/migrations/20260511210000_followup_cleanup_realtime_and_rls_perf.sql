-- Follow-up cleanup from the audit batch:
--
-- 1. Add vendor_partner_messages to supabase_realtime publication so
--    the native partner-thread screen (PR #142) actually receives
--    INSERT events in real time. Without this the screen only
--    refreshes on reload.
--
-- 2. Rewrite the auth.uid()-using RLS policies on the new tables to
--    call (select auth.uid()) instead. Supabase's auth_rls_initplan
--    advisor flags the per-row evaluation; the subquery form is
--    evaluated once per statement.
--
-- 3. Cover host_verification_requests.reviewer_id with an index.

-- (1) Realtime publication
alter publication supabase_realtime add table public.vendor_partner_messages;

-- (2a) thread_mutes
drop policy if exists "thread_mutes self read"   on public.thread_mutes;
drop policy if exists "thread_mutes self insert" on public.thread_mutes;
drop policy if exists "thread_mutes self delete" on public.thread_mutes;

create policy "thread_mutes self read"
  on public.thread_mutes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "thread_mutes self insert"
  on public.thread_mutes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "thread_mutes self delete"
  on public.thread_mutes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- (2b) thread_reports
drop policy if exists "thread_reports self insert" on public.thread_reports;
drop policy if exists "thread_reports admin read"  on public.thread_reports;

create policy "thread_reports self insert"
  on public.thread_reports for insert to authenticated
  with check ((select auth.uid()) = reporter_id);

create policy "thread_reports admin read"
  on public.thread_reports for select to authenticated
  using ((select public.is_admin()));

-- (2c) host_verification_requests
drop policy if exists "host_verifications self read"   on public.host_verification_requests;
drop policy if exists "host_verifications self insert" on public.host_verification_requests;
drop policy if exists "host_verifications admin read"  on public.host_verification_requests;
drop policy if exists "host_verifications admin write" on public.host_verification_requests;

create policy "host_verifications self read"
  on public.host_verification_requests for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "host_verifications self insert"
  on public.host_verification_requests for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending');

create policy "host_verifications admin read"
  on public.host_verification_requests for select to authenticated
  using ((select public.is_admin()));

create policy "host_verifications admin write"
  on public.host_verification_requests for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- (3) Cover the reviewer FK with an index
create index if not exists host_verification_requests_reviewer_idx
  on public.host_verification_requests (reviewer_id)
  where reviewer_id is not null;
