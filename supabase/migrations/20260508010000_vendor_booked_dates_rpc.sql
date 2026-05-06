-- The public listing's availability calendar already reflects one-off
-- blocks (vendor_unavailable_dates) and recurring rules
-- (vendor_availability_rules), but accepted appointments — the actual
-- meetings the vendor has on their /vendor/calendar — never made it
-- into the "blocked" set. Hosts could see open dates that the vendor
-- already has booked elsewhere on the platform.
--
-- Appointments rows can't be exposed directly: they include host_id,
-- notes, and meeting URLs. This RPC returns just distinct calendar
-- dates for accepted appointments in the next 6 months, which is the
-- minimum information the calendar needs to mark a day as blocked.

create or replace function public.vendor_booked_dates(p_vendor_id uuid)
returns setof date
language sql
stable
security definer
set search_path = public
as $$
  select distinct (scheduled_at at time zone 'UTC')::date
  from public.appointments
  where vendor_id = p_vendor_id
    and status = 'accepted'
    and scheduled_at >= now()
    and scheduled_at <= now() + interval '6 months'
$$;

grant execute on function public.vendor_booked_dates(uuid) to anon, authenticated;
