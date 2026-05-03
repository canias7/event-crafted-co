-- Vendor profiles are a public directory listing (like a Yelp page) and
-- should be browsable by anonymous visitors before signup. Replace the
-- authenticated-only SELECT policy with a public one. Insert/update remain
-- restricted to the owning vendor.

drop policy if exists "vendor_profiles select authed" on public.vendor_profiles;

create policy "vendor_profiles public read"
  on public.vendor_profiles
  for select
  using (true);
