-- Public buckets (vendor-portfolios, vendor-posts, vendor-reels,
-- vendor-showcase-clips, review-photos, editorial-images,
-- message-attachments) had a broad "public read" SELECT policy on
-- storage.objects that let any caller list every file in the bucket.
-- The bucket's own public=true flag is what makes URL access work
-- (the `/storage/v1/object/public/<bucket>/<path>` route bypasses
-- storage.objects RLS entirely) — these policies only added listing.
--
-- Particularly material for `message-attachments`: inquiry-thread
-- files (host contracts, IDs, etc.) were enumerable, not just
-- accessible by URL.
--
-- Verified before drop: zero `.list()` calls on these buckets in the
-- app (apps/web + apps/admin). getPublicUrl() continues to work
-- because it does not hit storage.objects SELECT.

drop policy if exists "vendor portfolios public read" on storage.objects;
drop policy if exists "vendor-posts public read" on storage.objects;
drop policy if exists "vendor-reels public read" on storage.objects;
drop policy if exists "vendor showcase clips public read" on storage.objects;
drop policy if exists "review photos public read" on storage.objects;
drop policy if exists "editorial images public read" on storage.objects;
drop policy if exists "message attachments public read" on storage.objects;
