-- Grandfathered "no limit" whitelist for the listing-cap feature
-- that hasn't shipped yet. Operators flip this true on accounts
-- that get unlimited listings regardless of subscription plan
-- (Free is otherwise capped at 1, Pro at 5).
--
-- Backfilled true for the five seed accounts the operator
-- identified in the admin Users screenshot — demo / staff
-- accounts that always ignore the cap.

alter table public.profiles
  add column if not exists unlimited_listings boolean not null default false;

update public.profiles
   set unlimited_listings = true
 where id in (
   'a1ae5970-642e-4796-9e60-90af2a1f17ca',
   '7a23bdce-7194-4f10-bcd7-071120750cc5',
   '74d0a3fe-5dfe-4a57-b23b-7fb8e915a503',
   '7a94c79d-0d6b-427f-ad9a-d341b3d89ad2',
   '2eba0687-ef58-4d1f-adb0-ea5d80711e24'
 );
