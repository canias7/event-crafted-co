-- Guard appointments.inquiry_id against cross-party attachment.
-- The FK only verifies the inquiry exists, not that its two parties
-- match the appointment's. Without this, an authenticated user could
-- create an appointment between themselves and a vendor, then set
-- inquiry_id to any inquiry UUID they happen to know (they can't
-- read it through RLS, but the attachment is still an IDOR-adjacent
-- info-leak surface).
--
-- BEFORE INSERT OR UPDATE OF inquiry_id, host_id, vendor_id —
-- reject if the inquiry's host_id / vendor_id do not match the
-- appointment's. Skipped entirely when inquiry_id is null
-- (standalone appointments stay allowed).

create or replace function public.tg_appointments_inquiry_match_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_inq_host uuid;
  v_inq_vendor uuid;
begin
  if new.inquiry_id is null then
    return new;
  end if;
  select host_id, vendor_id into v_inq_host, v_inq_vendor
    from public.inquiries where id = new.inquiry_id;
  if v_inq_host is null then
    raise exception 'inquiry_not_found';
  end if;
  if v_inq_host <> new.host_id or v_inq_vendor <> new.vendor_id then
    raise exception 'inquiry_parties_mismatch';
  end if;
  return new;
end
$$;

drop trigger if exists appointments_inquiry_match_guard
  on public.appointments;
create trigger appointments_inquiry_match_guard
  before insert or update of inquiry_id, host_id, vendor_id
  on public.appointments
  for each row
  execute function public.tg_appointments_inquiry_match_guard();
