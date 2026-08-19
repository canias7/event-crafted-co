-- Smart Scheduling & Automations (Premium) + Fill Your Calendar.
-- Free keeps the basic calendar + ONE appointment type; Premium
-- ('studio' tier) unlocks multiple types, working-hours scheduling,
-- booking rules, automated messages, and approved-only promotions.

create table if not exists public.vendor_appointment_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  duration_minutes integer not null default 60,
  description text,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists vendor_appt_types_user_idx
  on public.vendor_appointment_types (user_id, display_order);
alter table public.vendor_appointment_types enable row level security;
drop policy if exists "appt_types_owner_all" on public.vendor_appointment_types;
create policy "appt_types_owner_all" on public.vendor_appointment_types
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "appt_types_public_read" on public.vendor_appointment_types;
create policy "appt_types_public_read" on public.vendor_appointment_types
  for select using (active = true);

create table if not exists public.vendor_scheduling_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  working_hours jsonb not null default '{}'::jsonb,
  buffer_minutes integer not null default 0,
  min_notice_hours integer not null default 0,
  max_per_day integer,
  auto_reply_enabled boolean not null default false,
  auto_reply_text text,
  confirm_enabled boolean not null default false,
  confirm_text text,
  reminder_enabled boolean not null default false,
  reminder_hours_before integer not null default 24,
  reminder_text text,
  followup_enabled boolean not null default false,
  followup_days_after integer not null default 3,
  followup_text text,
  review_enabled boolean not null default false,
  review_days_after integer not null default 7,
  review_text text,
  alt_dates_enabled boolean not null default false,
  fill_calendar_enabled boolean not null default false,
  fill_lookahead_days integer not null default 14,
  updated_at timestamptz not null default now()
);
alter table public.vendor_scheduling_settings enable row level security;
drop policy if exists "sched_owner_all" on public.vendor_scheduling_settings;
create policy "sched_owner_all" on public.vendor_scheduling_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.vendor_promo_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid references public.vendor_profiles(id) on delete cascade,
  open_dates date[] not null default '{}',
  message text,
  status text not null default 'suggested'
    check (status in ('suggested','approved','dismissed','expired')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists vendor_promo_user_idx
  on public.vendor_promo_suggestions (user_id, created_at desc);
alter table public.vendor_promo_suggestions enable row level security;
drop policy if exists "promo_owner_all" on public.vendor_promo_suggestions;
create policy "promo_owner_all" on public.vendor_promo_suggestions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "promo_public_read" on public.vendor_promo_suggestions;
create policy "promo_public_read" on public.vendor_promo_suggestions
  for select using (status = 'approved');

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  kind text not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (kind, target_id)
);
alter table public.automation_events enable row level security;
drop policy if exists "automation_events_owner_read" on public.automation_events;
create policy "automation_events_owner_read" on public.automation_events
  for select using (auth.uid() = user_id);

create or replace function public.is_premium_user(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select subscription_tier in ('studio','premium') from public.profiles where id = p_user_id),
    false
  );
$$;

create or replace function public.vendor_day_open(p_vendor_id uuid, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
      select 1 from public.vendor_unavailable_dates d
      where d.vendor_id = p_vendor_id and d.date = p_date)
    and not exists (
      select 1 from public.vendor_availability_rules r
      where r.vendor_id = p_vendor_id
        and r.day_of_week = extract(dow from p_date)::int
        and r.is_unavailable)
    and not exists (
      select 1 from public.inquiries i
      where i.vendor_id = p_vendor_id and i.status = 'won'
        and i.event_date = p_date);
$$;

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

drop trigger if exists trg_auto_reply_on_inquiry on public.inquiries;
create trigger trg_auto_reply_on_inquiry
  after insert on public.inquiries
  for each row execute function public.auto_reply_on_inquiry();

create or replace function public.confirm_message_on_appointment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_settings public.vendor_scheduling_settings%rowtype;
  v_thread uuid;
  v_body text;
begin
  if new.status is distinct from 'confirmed' or old.status = 'confirmed' then
    return new;
  end if;
  v_owner := new.owner_user_id;
  if v_owner is null then
    select user_id into v_owner from public.vendor_profiles where id = new.vendor_id;
  end if;
  if v_owner is null or not public.is_premium_user(v_owner) then return new; end if;
  select * into v_settings from public.vendor_scheduling_settings where user_id = v_owner;
  if not found or not v_settings.confirm_enabled
     or coalesce(trim(v_settings.confirm_text), '') = '' then
    return new;
  end if;
  if new.inquiry_id is null then return new; end if;
  begin
    insert into public.automation_events (user_id, kind, target_id)
    values (v_owner, 'confirm', new.id);
  exception when unique_violation then
    return new;
  end;
  select id into v_thread from public.direct_threads where inquiry_id = new.inquiry_id limit 1;
  if v_thread is null then return new; end if;
  v_body := trim(v_settings.confirm_text) || e'\n\n'
    || coalesce(new.title, 'Appointment') || ' — '
    || to_char(new.scheduled_at at time zone 'UTC', 'FMMon FMDD, HH12:MI AM') || ' UTC';
  insert into public.direct_messages (thread_id, sender_id, sender_role, body)
  values (v_thread, v_owner, 'vendor', v_body);
  update public.direct_threads set last_message_at = now() where id = v_thread;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_confirm_message_on_appointment on public.appointments;
create trigger trg_confirm_message_on_appointment
  after update on public.appointments
  for each row execute function public.confirm_message_on_appointment();

create or replace function public.run_vendor_automations()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  s record;
  v_thread uuid;
begin
  for r in
    select a.id, a.inquiry_id, a.title, a.scheduled_at,
           coalesce(a.owner_user_id, vp.user_id) as owner,
           st.reminder_text
    from public.appointments a
    left join public.vendor_profiles vp on vp.id = a.vendor_id
    join public.vendor_scheduling_settings st
      on st.user_id = coalesce(a.owner_user_id, vp.user_id)
    where a.status = 'confirmed'
      and st.reminder_enabled
      and a.inquiry_id is not null
      and a.scheduled_at > now()
      and a.scheduled_at <= now() + make_interval(hours => st.reminder_hours_before)
      and public.is_premium_user(coalesce(a.owner_user_id, vp.user_id))
      and not exists (select 1 from public.automation_events e
                      where e.kind = 'reminder' and e.target_id = a.id)
  loop
    select id into v_thread from public.direct_threads where inquiry_id = r.inquiry_id limit 1;
    if v_thread is not null then
      insert into public.automation_events (user_id, kind, target_id)
      values (r.owner, 'reminder', r.id)
      on conflict do nothing;
      insert into public.direct_messages (thread_id, sender_id, sender_role, body)
      values (v_thread, r.owner, 'vendor',
        coalesce(nullif(trim(r.reminder_text), ''), 'Friendly reminder about our upcoming appointment!')
        || e'\n\n' || coalesce(r.title, 'Appointment') || ' — '
        || to_char(r.scheduled_at at time zone 'UTC', 'FMMon FMDD, HH12:MI AM') || ' UTC');
      update public.direct_threads set last_message_at = now() where id = v_thread;
    end if;
  end loop;

  for r in
    select a.id, a.inquiry_id,
           coalesce(a.owner_user_id, vp.user_id) as owner,
           st.followup_text
    from public.appointments a
    left join public.vendor_profiles vp on vp.id = a.vendor_id
    join public.vendor_scheduling_settings st
      on st.user_id = coalesce(a.owner_user_id, vp.user_id)
    where a.status = 'confirmed'
      and st.followup_enabled
      and a.inquiry_id is not null
      and a.scheduled_at < now() - make_interval(days => st.followup_days_after)
      and a.scheduled_at > now() - interval '30 days'
      and public.is_premium_user(coalesce(a.owner_user_id, vp.user_id))
      and not exists (select 1 from public.automation_events e
                      where e.kind = 'followup' and e.target_id = a.id)
  loop
    select id into v_thread from public.direct_threads where inquiry_id = r.inquiry_id limit 1;
    if v_thread is not null then
      insert into public.automation_events (user_id, kind, target_id)
      values (r.owner, 'followup', r.id)
      on conflict do nothing;
      insert into public.direct_messages (thread_id, sender_id, sender_role, body)
      values (v_thread, r.owner, 'vendor',
        coalesce(nullif(trim(r.followup_text), ''),
          'Just following up — any questions I can answer?'));
      update public.direct_threads set last_message_at = now() where id = v_thread;
    end if;
  end loop;

  for r in
    select i.id, vp.user_id as owner, st.review_text
    from public.inquiries i
    join public.vendor_profiles vp on vp.id = i.vendor_id
    join public.vendor_scheduling_settings st on st.user_id = vp.user_id
    where i.status = 'won'
      and st.review_enabled
      and i.event_date is not null
      and i.event_date < current_date - st.review_days_after
      and i.event_date > current_date - 60
      and public.is_premium_user(vp.user_id)
      and not exists (select 1 from public.automation_events e
                      where e.kind = 'review' and e.target_id = i.id)
  loop
    select id into v_thread from public.direct_threads where inquiry_id = r.id limit 1;
    if v_thread is not null then
      insert into public.automation_events (user_id, kind, target_id)
      values (r.owner, 'review', r.id)
      on conflict do nothing;
      insert into public.direct_messages (thread_id, sender_id, sender_role, body)
      values (v_thread, r.owner, 'vendor',
        coalesce(nullif(trim(r.review_text), ''),
          'It was a pleasure being part of your event! If you have a minute, we''d love a review — it helps other hosts find us.'));
      update public.direct_threads set last_message_at = now() where id = v_thread;
    end if;
  end loop;

  for s in
    select st.user_id, st.fill_lookahead_days
    from public.vendor_scheduling_settings st
    where st.fill_calendar_enabled
      and public.is_premium_user(st.user_id)
      and not exists (
        select 1 from public.vendor_promo_suggestions p
        where p.user_id = st.user_id
          and p.created_at > now() - interval '7 days')
  loop
    declare
      v_vendor uuid;
      v_dates date[] := '{}';
      v_d date;
    begin
      select id into v_vendor from public.vendor_profiles
      where user_id = s.user_id and application_status = 'approved'
      order by created_at asc limit 1;
      if v_vendor is null then continue; end if;
      v_d := current_date + 1;
      while v_d <= current_date + s.fill_lookahead_days loop
        if public.vendor_day_open(v_vendor, v_d) then
          v_dates := array_append(v_dates, v_d);
        end if;
        v_d := v_d + 1;
      end loop;
      if array_length(v_dates, 1) >= 1 then
        insert into public.vendor_promo_suggestions (user_id, vendor_id, open_dates, status)
        values (s.user_id, v_vendor, v_dates, 'suggested');
        insert into public.notifications (user_id, type, title, body, link)
        values (
          s.user_id,
          'fill_calendar',
          'You have ' || array_length(v_dates, 1) || ' open date'
            || case when array_length(v_dates, 1) = 1 then '' else 's' end
            || ' coming up',
          'Promote your openings to attract last-minute bookings — nothing goes live without your approval.',
          '/vendor/calendar');
      end if;
    exception when others then
      null;
    end;
  end loop;

  update public.vendor_promo_suggestions
  set status = 'expired'
  where status = 'suggested' and created_at < now() - interval '14 days';

  update public.vendor_promo_suggestions
  set status = 'expired'
  where status = 'approved'
    and not exists (select 1 from unnest(open_dates) d where d >= current_date);
end;
$$;

do $$
begin
  perform cron.unschedule('vendor-automations-hourly');
exception when others then
  null;
end $$;
select cron.schedule('vendor-automations-hourly', '15 * * * *',
  'select public.run_vendor_automations()');
