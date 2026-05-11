-- Auto-geocode a vendor's listing the moment they save a new location.
-- Mirrors the notification fanout pattern: AFTER INSERT/UPDATE on the
-- table, fire pg_net.http_post to the matching edge function.
-- geocode-vendor is deployed with verify_jwt = false so the call
-- doesn't need a bearer token, and it's idempotent (skips when the
-- location hasn't changed since the last successful geocode), so a
-- duplicate POST after a non-location update is harmless.

create or replace function public.tg_vendor_profiles_geocode_on_location_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url constant text :=
    'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/geocode-vendor';
  v_should_fire boolean := false;
begin
  -- Inserts with a location, OR updates that change the location string.
  if TG_OP = 'INSERT' then
    v_should_fire := new.location is not null and length(trim(new.location)) > 0;
  elsif TG_OP = 'UPDATE' then
    v_should_fire := new.location is distinct from old.location
                     and new.location is not null
                     and length(trim(new.location)) > 0;
  end if;

  if not v_should_fire then
    return new;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('vendorId', new.id)
    );
  exception when others then
    -- Best-effort: pg_net errors should never block a vendor's save.
    null;
  end;

  return new;
end;
$$;

drop trigger if exists vendor_profiles_geocode on public.vendor_profiles;
create trigger vendor_profiles_geocode
  after insert or update of location on public.vendor_profiles
  for each row execute function public.tg_vendor_profiles_geocode_on_location_change();

revoke execute on function public.tg_vendor_profiles_geocode_on_location_change() from public, anon, authenticated;
