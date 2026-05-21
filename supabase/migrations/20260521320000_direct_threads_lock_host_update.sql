-- Lock down direct_threads UPDATE so hosts can't twiddle HILUX state.
--
-- Before: "direct_threads update participants" allowed host_id OR
-- vendor team member to UPDATE any column. A malicious host could
-- flip hilux_paused = true (silently muting HILUX for them) or
-- write hilux_typing_until to fake the typing indicator.
--
-- After: only vendor team members can UPDATE direct_threads. Hosts
-- never need to update threads in any code path — they only insert
-- (create new threads) and read.

drop policy if exists "direct_threads update participants"
  on public.direct_threads;

create policy "direct_threads vendor update"
  on public.direct_threads for update to authenticated
  using (public.is_vendor_member(vendor_id))
  with check (public.is_vendor_member(vendor_id));
