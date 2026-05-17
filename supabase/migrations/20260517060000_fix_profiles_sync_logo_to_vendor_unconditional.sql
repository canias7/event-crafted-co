-- profiles_sync_logo_to_vendor previously only synced the brand logo
-- into vendor_profiles rows that had no logo of their own
-- (`WHERE logo_url IS NULL`). That meant: once a listing picked up a
-- logo, the vendor could change or REMOVE their account logo and the
-- listing would keep the stale one forever. Visible bug: vendor
-- clears logo on /vendor/edit-profile → listing card on /vendor/me
-- and the public listing page still show the old picture.
--
-- The brand identity is the source of truth — every listing the
-- vendor owns should always display the current account logo. Drop
-- the `IS NULL` filter so the trigger propagates updates AND clears.

create or replace function public.profiles_sync_logo_to_vendor()
returns trigger
language plpgsql
as $function$
begin
  if new.logo_url is distinct from old.logo_url then
    update public.vendor_profiles
       set logo_url = new.logo_url
     where user_id = new.id;
  end if;
  return new;
end;
$function$;

-- Backfill: clear any vendor_profiles.logo_url that's hanging on
-- after the account logo was already removed (so existing users
-- whose listings still show a stale logo get fixed without having
-- to flip the profile logo twice).
update public.vendor_profiles vp
   set logo_url = null
  from public.profiles p
 where p.id = vp.user_id
   and p.logo_url is null
   and vp.logo_url is not null;
