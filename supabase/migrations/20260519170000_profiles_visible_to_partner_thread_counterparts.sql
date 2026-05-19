-- profiles row was visible to inquiry counterparts + team mates +
-- self, but NOT to vendor_partner_threads counterparts. The partner
-- chat join silently returned NULL, so the other vendor's name and
-- logo never rendered — UI fell through to "Vendor" + "V" initial.

create policy "profiles visible to partner thread counterparts"
  on public.profiles
  for select
  using (
    exists (
      select 1
        from public.vendor_partner_threads t
       where (
         (t.user_a_id = profiles.id and t.user_b_id = (select auth.uid()))
         or (t.user_b_id = profiles.id and t.user_a_id = (select auth.uid()))
       )
    )
  );
