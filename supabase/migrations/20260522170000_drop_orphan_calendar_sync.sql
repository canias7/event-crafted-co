-- Kill the orphan Google-Calendar push-sync infrastructure on
-- appointments. Migration 20260503520000 added the
-- appointments_fanout_calendar trigger which fires net.http_post to
-- /functions/v1/sync-google-calendar on every appointment write —
-- but that edge function was removed long ago, and the supporting
-- tables (calendar_connections, calendar_synced_busy) were dropped
-- in 20260515240000. The trigger has been making a useless 404 call
-- on every appointment write, swallowing the error.
--
-- Also drops the three appointments columns that the sync function
-- would have populated (external_event_id, external_event_provider,
-- external_synced_at) — never written by anything, no frontend
-- consumer.

drop trigger if exists appointments_fanout_calendar
  on public.appointments;
drop function if exists public.fanout_appointment_to_calendar();

alter table public.appointments
  drop column if exists external_event_id,
  drop column if exists external_event_provider,
  drop column if exists external_synced_at;
