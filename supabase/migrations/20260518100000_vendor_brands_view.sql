-- Public-safe brand projection of profiles. The base profiles table
-- locks SELECT down to own-row / teammates / inquiry counterparts to
-- protect personal fields (phone, suspended_at, etc). The Explore +
-- vendor Home feeds need the brand identity of every approved vendor
-- whose content shows up — business_name + logo_url, nothing else —
-- so expose just that slice through a view.
--
-- PostgREST detects the relationship via the underlying FK
-- (vendor_posts.user_id → profiles.id), so embeds work as:
--   vendor:vendor_brands!vendor_posts_user_id_profiles_fkey!inner(...)
--
-- The view is security_invoker = false (the default) so it runs as
-- the view owner and bypasses the profiles RLS — which is the whole
-- point. The WHERE clause is the gate.

create or replace view public.vendor_brands as
select
  p.id,
  p.business_name,
  p.logo_url
from public.profiles p
where p.role = 'vendor' and p.application_status = 'approved';

grant select on public.vendor_brands to anon, authenticated;
