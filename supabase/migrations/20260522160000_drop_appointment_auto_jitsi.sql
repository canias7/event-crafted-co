-- Kill the silent auto-Jitsi behavior on appointments. Migration
-- 20260503550000_appointment_video_links.sql added a BEFORE INSERT
-- trigger that stamped a Jitsi room URL on appointments whose kind
-- was consultation / phone_call / other. There was never a UI to
-- propose a video meeting (ProposeAppointmentModal only collects
-- kind, duration, when, free-text location, notes), and the
-- follow-on "upgrade to Google Meet" sync function it referenced
-- (sync-google-calendar) was dropped long ago, so the trigger was
-- silently writing meeting URLs nobody asked for — including on
-- in-person events filed under kind='other'.
--
-- Drop the trigger + function and both columns. The location field
-- already accepts free text ("Address, Zoom link, or phone number"),
-- which is the actual UX for sharing meeting details.

drop trigger if exists appointments_default_meeting_url
  on public.appointments;
drop function if exists public.set_default_meeting_url();

alter table public.appointments
  drop column if exists meeting_url,
  drop column if exists meeting_provider;
