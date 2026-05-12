-- When a vendor with EXACTLY ONE listing edits their profile identity
-- (business_name / category / location / bio / logo_url), mirror those
-- changes into that single vendor_profiles row so the marketplace card
-- stays in sync.
--
-- Vendors with multiple listings keep the explicit separation: each
-- listing has its own identity that they manage from the listing
-- builder. Mirroring across multiple listings would silently overwrite
-- intentionally distinct branding.

create or replace function public.tg_profiles_sync_solo_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare v_count integer;
begin
  -- Only act when at least one of the synced fields actually changed.
  if new.business_name is not distinct from old.business_name
     and new.category   is not distinct from old.category
     and new.location   is not distinct from old.location
     and new.bio        is not distinct from old.bio
     and new.logo_url   is not distinct from old.logo_url then
    return new;
  end if;

  -- Only sync when the user has exactly one vendor listing.
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
    bio           = coalesce(new.bio,           bio),
    logo_url      = coalesce(new.logo_url,      logo_url)
  where user_id = new.id;

  return new;
end;
$function$;

drop trigger if exists profiles_sync_solo_listing on public.profiles;
create trigger profiles_sync_solo_listing
  after update on public.profiles
  for each row execute function public.tg_profiles_sync_solo_listing();

revoke execute on function public.tg_profiles_sync_solo_listing()
  from public, anon, authenticated, service_role;
