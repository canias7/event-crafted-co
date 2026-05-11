-- Wire two notification triggers to the existing public.notifications
-- table so the mobile apps can surface badges + a list of new
-- activity:
--
--   1. Vendor gets a notification when a host submits an inquiry.
--   2. The other party (host OR vendor) gets a notification when a
--      direct_message is sent in their thread.

create or replace function public.tg_inquiry_notify_vendor()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_owner uuid;
  v_event text;
begin
  select user_id into v_owner from public.vendor_profiles where id = new.vendor_id;
  if v_owner is null then
    return new;
  end if;

  v_event := coalesce(new.event_type, 'event');

  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_owner,
    'inquiry.new',
    'New inquiry from a host',
    initcap(v_event)
      || coalesce(' · ' || to_char(new.event_date, 'Mon DD'), '')
      || case when new.budget_max_cents is not null
              then ' · up to $' || (new.budget_max_cents / 100)
              else '' end,
    '/inbox/inquiry/' || new.id
  );
  return new;
end;
$$;

drop trigger if exists inquiries_notify_vendor on public.inquiries;
create trigger inquiries_notify_vendor
  after insert on public.inquiries
  for each row execute function public.tg_inquiry_notify_vendor();

create or replace function public.tg_direct_message_notify_other()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_host    uuid;
  v_vendor  uuid;
  v_owner   uuid;
  v_target  uuid;
  v_sender_name text;
begin
  select t.host_id, t.vendor_id
    into v_host, v_vendor
    from public.direct_threads t
   where t.id = new.thread_id;

  if new.sender_role = 'host' then
    select user_id into v_owner from public.vendor_profiles where id = v_vendor;
    v_target := v_owner;
    select coalesce(p.display_name, split_part(u.email, '@', 1))
      into v_sender_name
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = new.sender_id;
  else
    v_target := v_host;
    select coalesce(vp.business_name, p.display_name,
                    split_part(u.email, '@', 1))
      into v_sender_name
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.vendor_profiles vp on vp.user_id = u.id
     where u.id = new.sender_id;
  end if;

  if v_target is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_target,
    case when new.sender_role = 'host' then 'message.from_host'
         else 'message.from_vendor' end,
    case when v_sender_name is not null
         then 'New message from ' || v_sender_name
         else 'New message' end,
    substring(new.body from 1 for 140),
    '/inbox/thread/' || new.thread_id
  );
  return new;
end;
$$;

drop trigger if exists direct_messages_notify_other on public.direct_messages;
create trigger direct_messages_notify_other
  after insert on public.direct_messages
  for each row execute function public.tg_direct_message_notify_other();
