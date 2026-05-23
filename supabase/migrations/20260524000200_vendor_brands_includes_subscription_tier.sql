-- Expose subscription_tier on the public-safe vendor_brands view
-- so the front-end can read it through PostgREST embeds (vendor
-- card studio-verified badge, public detail page hero, etc.). Tier
-- is public information used to render the verified badge — no
-- privacy risk, mirrors what shows on browse pages anyway.

drop view if exists public.vendor_brands;
create view public.vendor_brands
with (security_invoker = on)
as
  select id, business_name, logo_url, bio, subscription_tier
    from public.profiles
   where role = 'vendor' and application_status = 'approved';

grant select on public.vendor_brands to anon, authenticated, service_role;
