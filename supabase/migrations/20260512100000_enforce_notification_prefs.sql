-- Honor profiles.notification_prefs in the notify_* triggers.
-- Previously the column existed but was never read - users who flipped
-- a pref off in their settings UI still received in-app + push
-- notifications.
--
-- Approach: a small helper public.is_notif_enabled(user_id, pref_key)
-- returns true if the user has the pref enabled OR the key is missing.
-- Default-on: a missing key means "we haven't asked the user yet".
--
-- Gated triggers (existing pref keys in the JSONB):
--   notify_inquiry_created          -> 'new_inquiry'
--   accept_proposal_side_effects    -> 'proposal_accepted'
--   notify_review_posted            -> 'review_received'
--
-- Intentionally NOT gated (no matching pref key today; these are also
-- the most time-sensitive):
--   notify_direct_message     - uses thread_mutes
--   notify_inquiry_status     - status flips matter even if you mute
--                               the initial inquiry
--   notify_appointment_*      - time-sensitive
--   notify_proposal_sent      - no proposal_received pref yet

create or replace function public.is_notif_enabled(
  p_user_id uuid,
  p_pref text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (notification_prefs ->> p_pref)::boolean
      from public.profiles
      where id = p_user_id
    ),
    true
  );
$$;

-- Trigger-only helper; revoke from public/anon/authenticated.
revoke execute on function public.is_notif_enabled(uuid, text)
  from public, anon, authenticated, service_role;

-- (1) notify_inquiry_created
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
  where m.vendor_id = new.vendor_id
    and public.is_notif_enabled(m.user_id, 'new_inquiry');
  return new;
end$function$;

-- (2) accept_proposal_side_effects - gate both branches
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
    where m.vendor_id = new.vendor_id
      and public.is_notif_enabled(m.user_id, 'proposal_accepted');

  elsif new.status = 'rejected' and old.status <> 'rejected' then
    insert into public.notifications (user_id, type, title, body, link)
    select
      m.user_id,
      'proposal_rejected',
      'Proposal declined',
      'The host declined your proposal. You can send a revised one.',
      '/vendor/inbox/' || new.inquiry_id::text
    from public.vendor_team_members m
    where m.vendor_id = new.vendor_id
      and public.is_notif_enabled(m.user_id, 'proposal_accepted');
  end if;
  return new;
end$function$;

-- (3) notify_review_posted
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
  where m.vendor_id = new.vendor_id
    and public.is_notif_enabled(m.user_id, 'review_received');
  return new;
end$function$;
