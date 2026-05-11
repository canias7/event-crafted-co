-- Drop the partial unique index that blocked one user from owning
-- multiple vendor_profiles rows.
--
-- The original guard (20260504080000_vendor_claim_listings.sql) made
-- sense in the single-listing world the app shipped with. The mobile
-- vendor app now supports vendors who run multiple marketplace
-- listings off one account — the Profile listing tab stacks them and
-- "+ Listing" inserts new drafts. Without dropping this index every
-- attempt to add a second listing fails with 23505.
--
-- We keep the PK on id + the unique slug as the actual identity
-- guarantees. RLS already scopes vendor_profiles writes to
-- auth.uid() = user_id, so dropping this doesn't open any new write
-- paths.

drop index if exists public.vendor_profiles_user_id_unique;
