-- Vendor app screens that show a host's display_name (thread header,
-- inbox row title, notifications bell list) all join through to
-- public.profiles at render time. The existing profiles RLS only
-- exposed rows to:
--   - the profile owner themselves
--   - vendor teammates (people who share a vendor_team_members row)
--   - admins
--
-- So a vendor querying a host's profile got null back, and every
-- thread on the vendor side rendered the fallback header "Host" with
-- no name. (Triggers populate notification titles via SECURITY DEFINER
-- so those still worked — only the live UI queries were broken.)
--
-- Adding a policy that opens read access to the profile of anyone the
-- vendor has a shared direct_thread or inquiry with. Symmetric: hosts
-- already see vendor profiles via public.vendor_profiles policies, so
-- this fills only the vendor → host gap.

create policy "profiles visible to inquiry/thread counterparts"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.vendor_team_members vtm
      where vtm.user_id = auth.uid()
        and (
          exists (
            select 1 from public.direct_threads dt
            where dt.host_id = profiles.id and dt.vendor_id = vtm.vendor_id
          )
          or exists (
            select 1 from public.inquiries i
            where i.host_id = profiles.id and i.vendor_id = vtm.vendor_id
          )
        )
    )
  );
