-- HILUX v1: vendor-opt-in AI auto-reply on host messages.
--
-- Adds a hilux_enabled flag to vendor_profiles and an is_hilux_generated
-- flag on direct_messages so the inbox can mark which replies came from
-- the agent. Then wires an AFTER INSERT trigger on direct_messages that
-- pings the hilux-respond edge function whenever a host sends a message
-- to a vendor that has HILUX turned on. Mirrors the geocode-vendor
-- pg_net pattern: best-effort, errors swallowed, edge function is
-- deployed verify_jwt=false so no bearer needed.
--
-- Loop guard: trigger only fires on sender_role = 'host'. HILUX inserts
-- replies as sender_role = 'vendor', so its own writes never re-fire it.

alter table public.vendor_profiles
  add column if not exists hilux_enabled boolean not null default false;

alter table public.direct_messages
  add column if not exists is_hilux_generated boolean not null default false;

create or replace function public.tg_direct_messages_hilux_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url constant text :=
    'https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/hilux-respond';
  v_enabled boolean;
begin
  if new.sender_role <> 'host' then
    return new;
  end if;

  select vp.hilux_enabled
    into v_enabled
    from public.direct_threads t
    join public.vendor_profiles vp on vp.id = t.vendor_id
   where t.id = new.thread_id;

  if v_enabled is not true then
    return new;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'thread_id', new.thread_id,
        'message_id', new.id
      )
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists direct_messages_hilux_reply on public.direct_messages;
create trigger direct_messages_hilux_reply
  after insert on public.direct_messages
  for each row execute function public.tg_direct_messages_hilux_reply();

revoke execute on function public.tg_direct_messages_hilux_reply() from public, anon, authenticated;
