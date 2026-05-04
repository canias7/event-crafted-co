-- Auto-generate a video meeting link on every appointment so hosts +
-- vendors don't have to message back and forth about "what platform
-- should we use." Defaults to a Jitsi room named after the appointment
-- (free, no auth, no API). When the appointment is pushed to Google
-- Calendar via outbound sync, the sync function upgrades the link to
-- a real Google Meet via conferenceData.createRequest — see
-- sync-google-calendar/index.ts.

alter table public.appointments
  add column if not exists meeting_url text,
  add column if not exists meeting_provider text
    check (meeting_provider in ('jitsi', 'google_meet') or meeting_provider is null);

-- Trigger: stamp a Jitsi URL on insert when no meeting_url is set
-- AND kind is one of the remote-friendly types (consultation, phone_call).
-- Walkthroughs / fittings / tastings are in-person so we skip them.
create or replace function public.set_default_meeting_url()
returns trigger
language plpgsql
as $$
begin
  if new.meeting_url is null and new.kind in ('consultation','phone_call','other') then
    new.meeting_url := 'https://meet.jit.si/vendora-' || replace(new.id::text, '-', '');
    new.meeting_provider := 'jitsi';
  end if;
  return new;
end$$;

drop trigger if exists appointments_default_meeting_url on public.appointments;
create trigger appointments_default_meeting_url
  before insert on public.appointments
  for each row execute function public.set_default_meeting_url();

-- Backfill existing remote-friendly appointments that don't have a link.
update public.appointments
set
  meeting_url = 'https://meet.jit.si/vendora-' || replace(id::text, '-', ''),
  meeting_provider = 'jitsi'
where meeting_url is null
  and kind in ('consultation','phone_call','other');
