-- Drop the trigger that auto-creates a draft vendor_profiles row the
-- instant a profile is created (or its role flips to 'vendor').
--
-- Why this was bad UX:
--   - Vendor signs up → admin tab shows "Pending applications" but
--     also a stub Listing they didn't make
--   - The vendor opens their profile and sees a phantom "Chria —
--     Draft — tap to finish setup" that was created server-side
--   - The auto-sync-to-solo-listing trigger then mutates this stub
--     whenever the vendor edits their identity, making it look like
--     the system is "deciding things for them"
--
-- New behavior: vendors only get a vendor_profiles row when they
-- explicitly tap "Create listing". The client-side path in
-- apps/vendor-mobile/app/(vendor)/listing.tsx still creates one on
-- first edit when needed.

drop trigger if exists profiles_ensure_vendor_profile on public.profiles;
drop function if exists public.ensure_vendor_profile_for_vendor_role();
