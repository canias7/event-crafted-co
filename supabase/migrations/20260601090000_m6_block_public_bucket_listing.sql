-- M6: stop anon/public from LISTING (enumerating) these public buckets.
-- Object serving uses the public CDN endpoint (buckets are public=true),
-- which bypasses RLS, so dropping these broad SELECT policies blocks
-- enumeration without affecting public image/logo reads. Verified the app
-- reads via getPublicUrl and writes via service-role only — nothing uses
-- the authenticated list/download API for these buckets.
drop policy if exists "ai-site-images public read" on storage.objects;
drop policy if exists "vendor logos public read" on storage.objects;
