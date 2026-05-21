-- HILUX trigger now resolves enable state via the LISTING's owner
-- profile, not the listing itself. Mirrors the move of HILUX config
-- from vendor_profiles to profiles. Pause is still per-thread.

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

  select p.hilux_enabled, t.hilux_paused
    into v_enabled, v_paused
    from public.direct_threads t
    join public.vendor_profiles vp on vp.id = t.vendor_id
    join public.profiles p on p.id = vp.user_id
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
