-- Fan vendor-side notifications out to every vendor_team_members
-- row, not just vendor_profiles.user_id. Pattern matches
-- notify_direct_message and notify_appointment_proposed
-- (vendor->host case already team-aware).
--
-- Affected functions:
--   notify_inquiry_created          (new inquiry -> all team)
--   accept_proposal_side_effects    (proposal accepted/rejected -> all team)
--   notify_review_posted            (new review -> all team)
--   notify_inquiry_status           (bidirectional: when host changes
--                                    status, notify vendor team; when
--                                    vendor changes, notify host -
--                                    matches notify_appointment_status
--                                    pattern)
--
-- All notification triggers are SECURITY DEFINER and search_path is
-- already locked to public by the legacy-functions migration. We just
-- replace the body.

create or replace function public.notify_inquiry_created()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare v_host_name text;
begin
  select coalesce(p.display_name, 'A host') into v_host_name
    from public.profiles p where p.id = new.host_id;
  insert into public.notifications (user_id, type, title, body, link)
  select
    m.user_id,
    'inquiry_created',
    'New inquiry',
    v_host_name || ' is asking about a ' || replace(new.event_type, '_', ' ') || ' event',
    '/vendor/inbox/' || new.id::text
  from public.vendor_team_members m
  where m.vendor_id = new.vendor_id;
  return new;
end$function$;

create or replace function public.accept_proposal_side_effects()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    update public.inquiries
      set status = 'won'
      where id = new.inquiry_id and status <> 'won';

    insert into public.notifications (user_id, type, title, body, link)
    select
      m.user_id,
      'proposal_accepted',
      'Proposal accepted',
      'Your proposal was accepted - the inquiry is now booked.',
      '/vendor/inbox/' || new.inquiry_id::text
    from public.vendor_team_members m
    where m.vendor_id = new.vendor_id;

  elsif new.status = 'rejected' and old.status <> 'rejected' then
    insert into public.notifications (user_id, type, title, body, link)
    select
      m.user_id,
      'proposal_rejected',
      'Proposal declined',
      'The host declined your proposal. You can send a revised one.',
      '/vendor/inbox/' || new.inquiry_id::text
    from public.vendor_team_members m
    where m.vendor_id = new.vendor_id;
  end if;
  return new;
end$function$;

create or replace function public.notify_review_posted()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare v_host_name text;
begin
  select coalesce(p.display_name, 'A host') into v_host_name
    from public.profiles p where p.id = new.host_id;
  insert into public.notifications (user_id, type, title, body, link)
  select
    m.user_id,
    'review_posted',
    v_host_name || ' left a review',
    'They rated you ' || new.rating::text || '/5.',
    '/vendor/inbox/' || new.inquiry_id::text
  from public.vendor_team_members m
  where m.vendor_id = new.vendor_id;
  return new;
end$function$;

-- Bidirectional: detect who triggered the status change via auth.uid()
-- and notify the OTHER side. Previously this only ever notified the
-- host, so when the host marked a booking won/lost the vendor team
-- never heard about it.
create or replace function public.notify_inquiry_status()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_actor_side text;
  v_vendor_name text;
  v_host_name text;
  v_title text;
  v_body text;
  v_vendor_link text;
  v_host_link text;
begin
  if new.status = old.status then return new; end if;

  -- Determine which side made the change. If auth.uid() is null
  -- (DB-internal triggers like accept_proposal_side_effects),
  -- v_actor_side stays null and we fall back to the legacy
  -- host-side-only behavior so we don't double-notify on proposal
  -- accept (accept_proposal_side_effects already notifies the team).
  v_actor_side := case
    when auth.uid() = new.host_id then 'host'
    when public.is_vendor_member(new.vendor_id) then 'vendor'
    else null
  end;

  if new.status = 'replied' then
    -- 'replied' is always vendor-action (set by message trigger).
    select coalesce(vp.business_name, 'A vendor') into v_vendor_name
      from public.vendor_profiles vp where vp.id = new.vendor_id;
    v_title := v_vendor_name || ' replied';
    v_body  := 'Tap to read their response.';
    insert into public.notifications (user_id, type, title, body, link)
    values (new.host_id, 'inquiry_status', v_title, v_body,
            '/customer/inquiries/' || new.id::text);

  elsif new.status = 'won' then
    if v_actor_side = 'host' then
      -- Host marked booked -> vendor team needs to know.
      select coalesce(p.display_name, 'The host') into v_host_name
        from public.profiles p where p.id = new.host_id;
      v_vendor_link := '/vendor/inbox/' || new.id::text;
      insert into public.notifications (user_id, type, title, body, link)
      select m.user_id, 'inquiry_status', 'Booking confirmed',
             v_host_name || ' marked the event as booked.', v_vendor_link
      from public.vendor_team_members m
      where m.vendor_id = new.vendor_id;
    else
      -- Vendor marked booked (or DB-internal proposal accept) ->
      -- host needs to know.
      select coalesce(vp.business_name, 'Your vendor') into v_vendor_name
        from public.vendor_profiles vp where vp.id = new.vendor_id;
      v_host_link := '/customer/inquiries/' || new.id::text;
      insert into public.notifications (user_id, type, title, body, link)
      values (new.host_id, 'inquiry_status', 'Booking confirmed',
              v_vendor_name || ' marked your event as booked.', v_host_link);
    end if;

  elsif new.status = 'lost' then
    if v_actor_side = 'host' then
      select coalesce(p.display_name, 'The host') into v_host_name
        from public.profiles p where p.id = new.host_id;
      v_vendor_link := '/vendor/inbox/' || new.id::text;
      insert into public.notifications (user_id, type, title, body, link)
      select m.user_id, 'inquiry_status', 'Inquiry closed',
             v_host_name || ' closed the inquiry.', v_vendor_link
      from public.vendor_team_members m
      where m.vendor_id = new.vendor_id;
    else
      select coalesce(vp.business_name, 'The vendor') into v_vendor_name
        from public.vendor_profiles vp where vp.id = new.vendor_id;
      v_host_link := '/customer/inquiries/' || new.id::text;
      insert into public.notifications (user_id, type, title, body, link)
      values (new.host_id, 'inquiry_status', 'Inquiry closed',
              v_vendor_name || ' closed this inquiry.', v_host_link);
    end if;
  end if;
  return new;
end$function$;
