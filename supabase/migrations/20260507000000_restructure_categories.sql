-- Restructure vendor categories from a flat 28-string list into the
-- new hierarchical taxonomy (8 groups · 31 sub-categories) defined in
-- src/data/categoryTaxonomy.ts. The DB column `vendor_profiles.category`
-- now stores the SUB name; the parent group is derived in code.
--
-- Stage 1 only touches the 28 demo rows (`is_demo = true`) — there are
-- no real signups yet. Real applications post-migration write the new
-- sub-category names directly via the rewritten signup form.
--
-- Categories with no slot in the new taxonomy (wedding-only Bridal
-- Salon, Officiant, Jeweler, Invitation Designer, Favors & Gifts,
-- Travel Specialist, Dance Instructor) get deleted along with their
-- demo rows. Hotels (a coming-soon placeholder) gets dropped too.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Rename categories on surviving rows. Idempotent — safe to re-run
--    because the WHERE clause filters by old category strings only.
-- ─────────────────────────────────────────────────────────────────────
update public.vendor_profiles set category = 'Event Venues'           where is_demo and category = 'Venue';
update public.vendor_profiles set category = 'Photography'            where is_demo and category = 'Photographer';
update public.vendor_profiles set category = 'Videography'            where is_demo and category = 'Videographer';
update public.vendor_profiles set category = 'Photo Booths'           where is_demo and category = 'Photo Booth';
update public.vendor_profiles set category = 'Catering'               where is_demo and category = 'Catering';
update public.vendor_profiles set category = 'Desserts & Cakes'       where is_demo and category = 'Baker';
update public.vendor_profiles set category = 'Bartending / Mobile Bars' where is_demo and category = 'Bartender';
update public.vendor_profiles set category = 'DJs'                    where is_demo and category = 'DJ';
update public.vendor_profiles set category = 'Live Music'             where is_demo and category in ('Band', 'Ensemble');
update public.vendor_profiles set category = 'Florists'               where is_demo and category = 'Florist';
update public.vendor_profiles set category = 'Event Coordinators'     where is_demo and category in ('Event Planner', 'Day-of Coordinator');
update public.vendor_profiles set category = 'Decor Rentals'          where is_demo and category = 'Decorator';
update public.vendor_profiles set category = 'Beauty'                 where is_demo and category in ('Beauty', 'Makeup Artist');
update public.vendor_profiles set category = 'Furniture Rentals'      where is_demo and category = 'Rentals';
update public.vendor_profiles set category = 'Transportation'         where is_demo and category = 'Transportation';
update public.vendor_profiles set category = 'Staffing'               where is_demo and category = 'Waitstaff';
update public.vendor_profiles set category = 'Security'               where is_demo and category = 'Security';
update public.vendor_profiles set category = 'Valet'                  where is_demo and category = 'Valet';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Delete demo rows whose old category has no home in the new
--    taxonomy (wedding-only specialties + the Hotels placeholder).
-- ─────────────────────────────────────────────────────────────────────
delete from public.vendor_profiles
where is_demo
  and category in (
    'Bridal Salon',
    'Officiant',
    'Jeweler',
    'Invitation Designer',
    'Favors & Gifts',
    'Travel Specialist',
    'Dance Instructor',
    'Hotel Block'
  );
