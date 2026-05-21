-- HILUX v1.3: per-thread pause + escalation hook.
--
-- Adds direct_threads.hilux_paused so a vendor can take over a
-- specific conversation without disabling HILUX globally. The
-- existing trigger now checks this flag and skips firing the edge
-- function when paused.

alter table public.direct_threads
  add column if not exists hilux_paused boolean not null default false;

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
  v_paused boolean;
begin
  if new.sender_role <> 'host' then
    return new;
  end if;

  select vp.hilux_enabled, t.hilux_paused
    into v_enabled, v_paused
    from public.direct_threads t
    join public.vendor_profiles vp on vp.id = t.vendor_id
   where t.id = new.thread_id;

  if v_enabled is not true then
    return new;
  end if;

  if v_paused is true then
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
