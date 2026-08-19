-- Verification applications are a Pro/Premium perk after all —
-- restore the Pro+ gate on submitting (reverts verification_open_to_all).
drop policy if exists "vvr_owner_insert" on public.vendor_verification_requests;
create policy "vvr_owner_insert" on public.vendor_verification_requests
  for insert with check (auth.uid() = user_id and public.is_pro_user(auth.uid()));
