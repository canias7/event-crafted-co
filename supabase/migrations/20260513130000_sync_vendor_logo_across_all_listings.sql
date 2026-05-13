-- The existing tg_profiles_sync_solo_listing trigger only mirrors
-- profile → vendor_profiles when the user has exactly one listing.
-- Intent: keep per-listing branding distinct for multi-listing vendors.
--
-- But logo_url is different: vendors almost always want the same logo
-- on every listing they own (one brand identity). The current policy
-- meant a vendor with 2+ listings uploads a logo via Edit profile and
-- it lands on profiles.logo_url but never reaches any of their
-- listings — hosts saw a blank avatar on the listing detail screen.
--
-- New behavior:
--   - business_name / category / location / bio: solo-only mirror (unchanged)
--   - logo_url: mirror to ALL the vendor's listings regardless of count
--
-- Plus a one-shot backfill so currently-blank listings catch up.

create or replace function public.tg_profiles_sync_solo_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare v_count integer;
begin
  if new.business_name is not distinct from old.business_name
     and new.category   is not distinct from old.category
     and new.location   is not distinct from old.location
     and new.bio        is not distinct from old.bio
     and new.logo_url   is not distinct from old.logo_url then
    return new;
  end if;

  -- Logo mirror runs on every listing the vendor owns. Lets a vendor
  -- maintain one brand identity even when they have multiple listings.
  if new.logo_url is distinct from old.logo_url and new.logo_url is not null then
    update public.vendor_profiles
       set logo_url = new.logo_url
     where user_id = new.id;
  end if;

  -- Identity mirror (name / category / location / bio) only when the
  -- vendor has exactly one listing — multi-listing vendors keep the
  -- explicit per-listing branding they set in the listing builder.
  select count(*) into v_count
  from public.vendor_profiles
  where user_id = new.id;

  if v_count <> 1 then
    return new;
  end if;

  update public.vendor_profiles
  set
    business_name = coalesce(new.business_name, business_name),
    category      = coalesce(new.category,      category),
    location      = coalesce(new.location,      location),
    bio           = coalesce(new.bio,           bio)
  where user_id = new.id;

  return new;
end;
$function$;

-- One-shot backfill — copy profile.logo_url onto every vendor_profiles
-- row where the listing currently has no logo and the profile does.
update public.vendor_profiles vp
   set logo_url = p.logo_url
  from public.profiles p
 where vp.user_id = p.id
   and vp.logo_url is null
   and p.logo_url is not null;
