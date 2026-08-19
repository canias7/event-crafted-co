-- Verification applications are open to EVERY vendor (any plan) —
-- the badge is still earned through manual admin review; only the
-- Pro+ eligibility gate on submitting is removed.
drop policy if exists "vvr_owner_insert" on public.vendor_verification_requests;
create policy "vvr_owner_insert" on public.vendor_verification_requests
  for insert with check (auth.uid() = user_id);
