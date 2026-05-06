-- Original vendor_profiles policy set covered SELECT, INSERT, UPDATE
-- but never DELETE, so RLS silently dropped every delete the owner
-- attempted from the dashboard — the row stayed in place and the
-- listing reappeared on next reload. This adds the missing policy
-- so vendors can actually remove their own profile + lets admins
-- (via vendor_team_members) clean up listings they manage.

create policy "vendor_profiles delete own"
  on public.vendor_profiles
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.vendor_team_members vtm
      where vtm.vendor_id = vendor_profiles.id
        and vtm.user_id = auth.uid()
        and vtm.role in ('owner', 'admin')
    )
  );
