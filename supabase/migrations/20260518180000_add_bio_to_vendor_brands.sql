-- vendor_brands previously only exposed id, business_name, logo_url.
-- Public listing display needs to fall back to brand bio when the
-- per-listing bio is null (which happens for every listing created
-- via the wizard, since the wizard doesn't copy it). Adding bio here
-- keeps the public-safe surface centralized.

create or replace view public.vendor_brands as
  select id, business_name, logo_url, bio
  from public.profiles
  where role = 'vendor' and application_status = 'approved';

grant select on public.vendor_brands to anon, authenticated;
