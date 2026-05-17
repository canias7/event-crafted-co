-- Posts, reels, and buzz are social content owned by the VENDOR
-- (user_id), not a specific marketplace LISTING (vendor_id). The
-- vendor_id column was historically NOT NULL, which forced posts
-- to be associated with a specific listing — confusing when a
-- vendor has multiple listings, and broken when a vendor hasn't
-- made any listing yet.

alter table public.vendor_posts alter column vendor_id drop not null;
alter table public.vendor_reels alter column vendor_id drop not null;
alter table public.vendor_buzz  alter column vendor_id drop not null;
