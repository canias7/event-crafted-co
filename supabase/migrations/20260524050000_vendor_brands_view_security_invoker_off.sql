-- Round-2 audit C3: vendor_brands view was created with
-- security_invoker = on, which means anon callers hit profiles RLS
-- (no public-read policy) and get zero rows. Studio verified badges
-- never render to logged-out visitors on browse pages or public
-- detail pages.
--
-- Fix: flip to security_invoker = off so the view runs with its
-- owner's privileges and bypasses profiles RLS. The view itself is
-- already narrowly scoped to (id, business_name, logo_url, bio,
-- subscription_tier) for approved vendors only — that's exactly the
-- public-safe subset of profiles.

drop view if exists public.vendor_brands;

create view public.vendor_brands
with (security_invoker = off)
as
  select id, business_name, logo_url, bio, subscription_tier
    from public.profiles
   where role = 'vendor' and application_status = 'approved';

grant select on public.vendor_brands to anon, authenticated, service_role;
