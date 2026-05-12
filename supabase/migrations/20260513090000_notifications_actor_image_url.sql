-- Surface the sender's profile photo / business logo on each notification
-- row so the bell sheet can render a real avatar instead of falling back
-- to a letter tile every time.
--
-- The trigger functions pick the right source:
--   - From a host → profiles.avatar_url
--   - From a vendor (business-shaped action) → vendor_profiles.logo_url
--
-- Existing rows stay NULL — the client falls back to the letter avatar
-- as it does today, so this is fully backwards compatible.

alter table public.notifications
  add column if not exists actor_image_url text;

-- notify_direct_message: sender is host → host avatar; sender is vendor
-- → vendor listing logo. Recipient depends on sender_role (mirrors the
-- existing routing).
create or replace function public.notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.direct_threads;
  v_sender_name text;
  v_sender_image text;
  v_vendor_name text;
  v_vendor_logo text;
begin
  select * into v_thread from public.direct_threads where id = new.thread_id;
  if v_thread.id is null then return new; end if;

  if new.sender_role = 'host' then
    select coalesce(p.display_name, 'A host'), p.avatar_url
      into v_sender_name, v_sender_image
      from public.profiles p where p.id = new.sender_id;
    insert into public.notifications (user_id, type, title, body, link, actor_image_url)
    select
      m.user_id,
      'direct_message',
      v_sender_name || ' sent you a message',
      left(new.body, 140),
      '/vendor/messages?thread=' || v_thread.id::text,
      v_sender_image
    from public.vendor_team_members m
    where m.vendor_id = v_thread.vendor_id
      and not exists (
        select 1 from public.thread_mutes mut
        where mut.user_id = m.user_id and mut.thread_id = v_thread.id
      );
  else
    select business_name, logo_url
      into v_vendor_name, v_vendor_logo
      from public.vendor_profiles where id = v_thread.vendor_id;
    if not exists (
      select 1 from public.thread_mutes mut
      where mut.user_id = v_thread.host_id and mut.thread_id = v_thread.id
    ) then
      insert into public.notifications (user_id, type, title, body, link, actor_image_url)
      values (
        v_thread.host_id,
        'direct_message',
        coalesce(v_vendor_name, 'A vendor') || ' sent you a message',
        left(new.body, 140),
        '/customer/messages?thread=' || v_thread.id::text,
        v_vendor_logo
      );
    end if;
  end if;
  return new;
end
$$;

-- notify_new_message: same idea, but for inquiry-thread messages.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.inquiries%rowtype;
  v_recipient uuid;
  v_sender_name text;
  v_sender_image text;
  v_link text;
begin
  if new.is_draft then return new; end if;
  select * into v_inquiry from public.inquiries where id = new.inquiry_id;
  if not found then return new; end if;
  if new.sender_role = 'host' then
    select vp.user_id into v_recipient from public.vendor_profiles vp where vp.id = v_inquiry.vendor_id;
    select coalesce(p.display_name, 'The host'), p.avatar_url
      into v_sender_name, v_sender_image
      from public.profiles p where p.id = v_inquiry.host_id;
    v_link := '/vendor/inbox/' || v_inquiry.id::text;
  else
    v_recipient := v_inquiry.host_id;
    select coalesce(vp.business_name, 'The vendor'), vp.logo_url
      into v_sender_name, v_sender_image
      from public.vendor_profiles vp where vp.id = v_inquiry.vendor_id;
    v_link := '/customer/inquiries/' || v_inquiry.id::text;
  end if;
  if v_recipient is not null then
    insert into public.notifications (user_id, type, title, body, link, actor_image_url)
    values (v_recipient, 'message_received', v_sender_name || ' sent a message', left(new.body, 140), v_link, v_sender_image);
  end if;
  return new;
end
$$;

-- notify_inquiry_created: actor is the host (vendor team sees host avatar).
create or replace function public.notify_inquiry_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_name text;
  v_host_image text;
begin
  select coalesce(p.display_name, 'A host'), p.avatar_url
    into v_host_name, v_host_image
    from public.profiles p where p.id = new.host_id;
  insert into public.notifications (user_id, type, title, body, link, actor_image_url)
  select
    m.user_id,
    'inquiry_created',
    'New inquiry',
    v_host_name || ' is asking about a ' || replace(new.event_type, '_', ' ') || ' event',
    '/vendor/inbox/' || new.id::text,
    v_host_image
  from public.vendor_team_members m
  where m.vendor_id = new.vendor_id
    and public.is_notif_enabled(m.user_id, 'new_inquiry');
  return new;
end
$$;

-- notify_proposal_sent: actor is the vendor (host sees business logo).
create or replace function public.notify_proposal_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor_name text;
  v_vendor_logo text;
begin
  select coalesce(business_name, 'A vendor'), logo_url
    into v_vendor_name, v_vendor_logo
    from public.vendor_profiles where id = new.vendor_id;
  insert into public.notifications (user_id, type, title, body, link, actor_image_url)
  values (
    new.host_id,
    'proposal_sent',
    v_vendor_name || ' sent a proposal',
    'Tap to review and accept or counter.',
    '/customer/inquiries/' || new.inquiry_id::text,
    v_vendor_logo
  );
  return new;
end
$$;

-- notify_review_posted: actor is the host (vendor team sees host avatar).
create or replace function public.notify_review_posted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_name text;
  v_host_image text;
begin
  select coalesce(p.display_name, 'A host'), p.avatar_url
    into v_host_name, v_host_image
    from public.profiles p where p.id = new.host_id;
  insert into public.notifications (user_id, type, title, body, link, actor_image_url)
  select
    m.user_id,
    'review_posted',
    v_host_name || ' left a review',
    'They rated you ' || new.rating::text || '/5.',
    '/vendor/inbox/' || new.inquiry_id::text,
    v_host_image
  from public.vendor_team_members m
  where m.vendor_id = new.vendor_id
    and public.is_notif_enabled(m.user_id, 'review_received');
  return new;
end
$$;

-- notify_appointment_proposed: actor is whoever proposed (mirrors role split).
create or replace function public.notify_appointment_proposed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_proposer_name text;
  v_proposer_image text;
  v_kind_label text;
  v_when text;
begin
  v_kind_label := replace(new.kind, '_', ' ');
  v_when := to_char(new.scheduled_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC';
  if new.proposed_by = 'vendor' then
    v_recipient := new.host_id;
    select coalesce(business_name, 'A vendor'), logo_url
      into v_proposer_name, v_proposer_image
      from public.vendor_profiles where id = new.vendor_id;
    insert into public.notifications (user_id, type, title, body, link, actor_image_url)
    values (v_recipient, 'appointment_proposed', v_proposer_name || ' proposed a ' || v_kind_label, v_when || ' - tap to accept or decline.', '/customer/appointments', v_proposer_image);
  else
    select coalesce(p.display_name, 'A host'), p.avatar_url
      into v_proposer_name, v_proposer_image
      from public.profiles p where p.id = new.host_id;
    insert into public.notifications (user_id, type, title, body, link, actor_image_url)
    select m.user_id, 'appointment_proposed', v_proposer_name || ' proposed a ' || v_kind_label, v_when || ' - tap to accept or decline.', '/vendor/appointments', v_proposer_image
    from public.vendor_team_members m where m.vendor_id = new.vendor_id;
  end if;
  return new;
end
$$;

-- notify_appointment_status: actor is whoever changed status.
create or replace function public.notify_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
  v_actor_image text;
  v_kind_label text;
  v_link text;
  v_actor_side text;
begin
  if new.status = old.status then return new; end if;
  v_kind_label := replace(new.kind, '_', ' ');
  v_actor_side := case
    when auth.uid() = new.host_id then 'host'
    when public.is_vendor_member(new.vendor_id) then 'vendor'
    else null
  end;
  if v_actor_side = 'host' then
    select coalesce(p.display_name, 'The host'), p.avatar_url
      into v_actor_name, v_actor_image
      from public.profiles p where p.id = new.host_id;
    v_link := '/vendor/appointments';
    insert into public.notifications (user_id, type, title, body, link, actor_image_url)
    select m.user_id, 'appointment_' || new.status, v_actor_name || ' ' || new.status || ' the ' || v_kind_label, to_char(new.scheduled_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC', v_link, v_actor_image
    from public.vendor_team_members m where m.vendor_id = new.vendor_id;
  elsif v_actor_side = 'vendor' then
    select coalesce(business_name, 'The vendor'), logo_url
      into v_actor_name, v_actor_image
      from public.vendor_profiles where id = new.vendor_id;
    v_link := '/customer/appointments';
    insert into public.notifications (user_id, type, title, body, link, actor_image_url)
    values (new.host_id, 'appointment_' || new.status, v_actor_name || ' ' || new.status || ' the ' || v_kind_label, to_char(new.scheduled_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC', v_link, v_actor_image);
  end if;
  return new;
end
$$;

-- notify_host_party_accepted: actor is the joining guest.
create or replace function public.notify_host_party_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_name text;
  v_member_image text;
begin
  if new.accepted_at is null or old.accepted_at is not null then return new; end if;
  select coalesce(display_name, new.email), avatar_url
    into v_member_name, v_member_image
    from public.profiles where id = new.member_user_id;
  insert into public.notifications (user_id, type, title, body, link, actor_image_url)
  values (
    new.host_id,
    'party_invite_accepted',
    v_member_name || ' joined your inner circle',
    'They can now see the schedule, vendors, and any tasks you assign.',
    '/customer/planning-team',
    v_member_image
  );
  return new;
end
$$;
