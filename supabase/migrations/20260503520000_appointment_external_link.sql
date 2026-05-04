-- Outbound calendar sync. Appointments tracked on Vendora can now be
-- mirrored to a connected external calendar (Google to start). Each
-- appointment row remembers the external event id + provider so the
-- sync function knows whether it needs to insert / update / delete on
-- the remote side.
--
-- The sync-google-calendar edge function reads appointments where
-- pull_target = the connected user (vendor user_id OR host_id) and
-- external_event_id is null + status = 'accepted', creates the event
-- in Google, then writes external_event_id + external_event_provider
-- back. On status flip to declined / cancelled it deletes the remote
-- event (the function handles the read-update-delete loop).

alter table public.appointments
  add column if not exists external_event_id text,
  add column if not exists external_event_provider text
    check (external_event_provider in ('google') or external_event_provider is null),
  add column if not exists external_synced_at timestamptz;

-- Optional fast path: when an appointment is created/updated/deleted
-- and BOTH parties have push_appointments enabled, we want to react
-- soon — not wait for the next 15-min cron tick. A trigger calls
-- pg_net.http_post on the sync function. Wrapped in EXCEPTION so it
-- can't break the parent insert if pg_net or env vars aren't ready.

create or replace function public.fanout_appointment_to_calendar()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_key text;
  v_vendor_user uuid;
begin
  begin
    v_url := current_setting('app.settings.supabase_url', true);
    v_key := current_setting('app.settings.service_role_key', true);
  exception when others then
    return coalesce(new, old);
  end;
  if v_url is null or v_key is null then
    return coalesce(new, old);
  end if;

  -- Resolve the vendor's user_id so the edge function can scope its
  -- "find connections for these users" query without re-joining.
  select user_id into v_vendor_user
    from public.vendor_profiles
    where id = coalesce(new.vendor_id, old.vendor_id);

  begin
    perform net.http_post(
      url := v_url || '/functions/v1/sync-google-calendar',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(coalesce(new.host_id, old.host_id), v_vendor_user),
        'mode', 'push_only'
      )
    );
  exception when others then
    null;
  end;
  return coalesce(new, old);
end$$;

drop trigger if exists appointments_fanout_calendar on public.appointments;
create trigger appointments_fanout_calendar
  after insert or update or delete on public.appointments
  for each row execute function public.fanout_appointment_to_calendar();

revoke execute on function public.fanout_appointment_to_calendar() from public, anon, authenticated;
