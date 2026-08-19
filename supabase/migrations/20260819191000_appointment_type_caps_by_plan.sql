-- Appointment-type caps by plan: Free 1 · Pro 5 · Premium unlimited.
-- Pro now carries the manual scheduling controls (working hours,
-- buffers, notice, daily limits, multiple types) while automations
-- stay Premium-only — this trigger backs the app's client-side cap
-- so it can't be bypassed with direct API calls. Self-serve inserts
-- only, same exemption shape as enforce_listing_cap.
create or replace function public.user_appointment_type_cap(p_user_id uuid)
returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  v_unlimited boolean;
  v_tier text;
begin
  select unlimited_listings, subscription_tier
    into v_unlimited, v_tier
    from public.profiles
   where id = p_user_id;
  if v_unlimited = true then
    return null;
  end if;
  v_tier := coalesce(v_tier, 'free');
  if    v_tier = 'studio' then return null; -- Premium: unlimited
  elsif v_tier = 'pro'    then return 5;
  else                         return 1;    -- free / legacy starter
  end if;
end;
$$;
grant execute on function public.user_appointment_type_cap(uuid) to authenticated;

create or replace function public.enforce_appointment_type_cap()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cap int;
begin
  if new.user_id is null or auth.uid() is distinct from new.user_id then
    return new;
  end if;
  v_cap := public.user_appointment_type_cap(new.user_id);
  if v_cap is not null and (
    select count(*) from public.vendor_appointment_types
     where user_id = new.user_id
  ) >= v_cap then
    raise exception 'appointment_type_cap_reached: your plan allows % appointment type(s). Upgrade for more.', v_cap;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_appointment_type_cap on public.vendor_appointment_types;
create trigger trg_enforce_appointment_type_cap
  before insert on public.vendor_appointment_types
  for each row execute function public.enforce_appointment_type_cap();
