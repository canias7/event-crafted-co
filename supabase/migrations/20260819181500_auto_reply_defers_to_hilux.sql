-- The static scheduling auto-reply and HILUX (the AI employee) could
-- both answer the same new inquiry for a Premium vendor with both
-- switched on. HILUX writes a smarter, context-aware reply, so when
-- it's enabled the static auto-reply steps aside.
create or replace function public.auto_reply_on_inquiry()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_settings public.vendor_scheduling_settings%rowtype;
  v_thread uuid;
  v_body text;
  v_req date;
  v_alt text := '';
  v_d date;
  v_found int := 0;
begin
  select user_id into v_owner from public.vendor_profiles where id = new.vendor_id;
  if v_owner is null or not public.is_premium_user(v_owner) then return new; end if;
  -- HILUX takes precedence: if the AI employee is on, it owns the
  -- first reply and the static auto-reply stays silent.
  if exists (
    select 1 from public.profiles
    where id = v_owner and hilux_enabled = true
  ) then
    return new;
  end if;
  select * into v_settings from public.vendor_scheduling_settings where user_id = v_owner;
  if not found or not v_settings.auto_reply_enabled
     or coalesce(trim(v_settings.auto_reply_text), '') = '' then
    return new;
  end if;
  begin
    insert into public.automation_events (user_id, kind, target_id)
    values (v_owner, 'auto_reply', new.id);
  exception when unique_violation then
    return new;
  end;

  select id into v_thread from public.direct_threads where inquiry_id = new.id limit 1;
  if v_thread is null then
    insert into public.direct_threads (inquiry_id, host_id, vendor_id)
    values (new.id, new.host_id, new.vendor_id)
    returning id into v_thread;
  end if;

  v_body := trim(v_settings.auto_reply_text);

  if v_settings.alt_dates_enabled and new.event_date is not null then
    begin
      v_req := new.event_date;
      if not public.vendor_day_open(new.vendor_id, v_req) then
        v_d := greatest(v_req - 7, current_date + 1);
        while v_found < 3 and v_d <= v_req + 45 loop
          if v_d <> v_req and v_d > current_date
             and public.vendor_day_open(new.vendor_id, v_d) then
            v_alt := v_alt || case when v_found > 0 then ', ' else '' end
              || to_char(v_d, 'FMMon FMDD');
            v_found := v_found + 1;
          end if;
          v_d := v_d + 1;
        end loop;
        if v_found > 0 then
          v_body := v_body || e'\n\nHeads up — '
            || to_char(v_req, 'FMMon FMDD')
            || ' may already be taken on our calendar, but we''re open on '
            || v_alt || '. Would one of those work?';
        end if;
      end if;
    exception when others then
      null;
    end;
  end if;

  insert into public.direct_messages (thread_id, sender_id, sender_role, body)
  values (v_thread, v_owner, 'vendor', v_body);
  update public.direct_threads set last_message_at = now() where id = v_thread;
  return new;
exception when others then
  return new;
end;
$$;
