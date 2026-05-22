-- Fix the appointment notification deep-links. /customer/appointments
-- was retired in favor of /customer/events (App.tsx redirects the
-- former to the latter), so every appointment notification was
-- forcing an extra redirect hop on the host side. Recreate the two
-- trigger functions with the canonical target. Vendor-side links
-- (/vendor/appointments) are unchanged — that route still exists.

create or replace function public.notify_appointment_proposed()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_recipient uuid;
  v_proposer_name text;
  v_kind_label text;
  v_when text;
begin
  v_kind_label := replace(new.kind, '_', ' ');
  v_when := to_char(new.scheduled_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC';

  if new.proposed_by = 'vendor' then
    v_recipient := new.host_id;
    select coalesce(business_name, 'A vendor') into v_proposer_name
      from public.vendor_profiles where id = new.vendor_id;
    insert into public.notifications (user_id, type, title, body, link)
    values (
      v_recipient,
      'appointment_proposed',
      v_proposer_name || ' proposed a ' || v_kind_label,
      v_when || ' — tap to accept or decline.',
      '/customer/events'
    );
  else
    select coalesce(p.display_name, 'A host') into v_proposer_name
      from public.profiles p where p.id = new.host_id;
    insert into public.notifications (user_id, type, title, body, link)
    select
      m.user_id,
      'appointment_proposed',
      v_proposer_name || ' proposed a ' || v_kind_label,
      v_when || ' — tap to accept or decline.',
      '/vendor/appointments'
    from public.vendor_team_members m
    where m.vendor_id = new.vendor_id;
  end if;

  return new;
end$$;

create or replace function public.notify_appointment_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_recipient uuid;
  v_actor_name text;
  v_kind_label text;
  v_link text;
  v_actor_side text;
begin
  if new.status = old.status then
    return new;
  end if;

  v_kind_label := replace(new.kind, '_', ' ');

  v_actor_side := case
    when auth.uid() = new.host_id then 'host'
    when public.is_vendor_member(new.vendor_id) then 'vendor'
    else null
  end;

  if v_actor_side = 'host' then
    select coalesce(p.display_name, 'The host') into v_actor_name
      from public.profiles p where p.id = new.host_id;
    v_link := '/vendor/appointments';
    insert into public.notifications (user_id, type, title, body, link)
    select
      m.user_id,
      'appointment_' || new.status,
      v_actor_name || ' ' || new.status || ' the ' || v_kind_label,
      to_char(new.scheduled_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC',
      v_link
    from public.vendor_team_members m
    where m.vendor_id = new.vendor_id;
  elsif v_actor_side = 'vendor' then
    select coalesce(business_name, 'The vendor') into v_actor_name
      from public.vendor_profiles where id = new.vendor_id;
    v_link := '/customer/events';
    insert into public.notifications (user_id, type, title, body, link)
    values (
      new.host_id,
      'appointment_' || new.status,
      v_actor_name || ' ' || new.status || ' the ' || v_kind_label,
      to_char(new.scheduled_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC',
      v_link
    );
  end if;

  return new;
end$$;
