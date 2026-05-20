-- Audit cleanup on the reviews subsystem.
--
-- 1. Drop the legacy single-review-per-inquiry UNIQUE constraint.
--    The bidirectional-reviews migration added the correct compound
--    index (inquiry_id, rater_role, kind) but didn't drop the
--    legacy one — silently blocking every second-party review with
--    a duplicate-key error.
--
-- 2. Converge moderation on hidden_at. The reviews table has both
--    is_hidden boolean and hidden_at timestamptz, and the public
--    read policy + package_rating_summary view + reviews_public
--    view disagree about which is canonical. Pick hidden_at — a
--    timestamp is strictly more useful than a boolean for moderation
--    audit — and drop is_hidden + the orphaned reviews_public view
--    that depended on it. Backfill any rows that had is_hidden=true
--    without hidden_at set first.

alter table public.reviews drop constraint if exists reviews_inquiry_id_key;

update public.reviews
   set hidden_at = coalesce(hidden_at, now()),
       hidden_reason = coalesce(hidden_reason, 'migrated_from_is_hidden')
 where is_hidden = true and hidden_at is null;

drop view if exists public.reviews_public;

alter table public.reviews drop column if exists is_hidden;
