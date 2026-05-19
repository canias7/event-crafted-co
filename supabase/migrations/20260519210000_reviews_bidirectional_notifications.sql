-- Bidirectional review notifications. Replaces the legacy
-- notify_review_posted (which leaked the host's rating to the vendor
-- team before mutual reveal) with a kind + role-aware function that
-- fires the right notification for each path:
--
--   • Event review submitted, opposite side hasn't reviewed yet →
--     notify the recipient party (vendor team OR host) with a BLIND
--     ping. No rating, no body — just "they reviewed you, write yours
--     to see it or it goes live in 14 days." Honors mutual blind
--     reveal end-to-end.
--
--   • Event review submitted, opposite side has already reviewed →
--     mutual reveal just happened. Notify BOTH parties that reviews
--     are now live. Still no rating in the body — the reader can
--     click through to see the actual content.
--
--   • Conversation rating submitted → notify the rated party
--     immediately. Conversation ratings aren't blind, so the body
--     can carry the rater's note as preview text.
--
-- One trigger, all three branches. Replaces the trigger named
-- reviews_notify_posted so we don't end up with two notifications
-- per insert. The 14-day silent-release path is not covered here —
-- released_at never gets stamped at the 14d boundary today (it's a
-- read-time check), so a future cron would need to handle that
-- notification.

create or replace function public.notify_review_posted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
  v_actor_image text;
  v_link_host text;
  v_link_vendor text;
  v_just_released boolean := false;
  v_other_party_label text;
begin
  v_link_host   := '/customer/inquiries/' || new.inquiry_id::text;
  v_link_vendor := '/vendor/inbox/' || new.inquiry_id::text;

  -- Actor = the person doing the reviewing.
  if new.rater_role = 'host' then
    select coalesce(p.display_name, 'A host'), p.avatar_url
      into v_actor_name, v_actor_image
      from public.profiles p where p.id = new.host_id;
  else
    select coalesce(business_name, 'A vendor'), logo_url
      into v_actor_name, v_actor_image
      from public.vendor_profiles where id = new.vendor_id;
  end if;

  -- Mutual-reveal detection for event reviews: by the time this
  -- AFTER INSERT trigger runs, the sibling reviews_mutual_release
  -- trigger has already stamped released_at on both rows IF the
  -- opposite-role row existed. We just check whether the opposite
  -- role has a row — only true on the SECOND event-review insert,
  -- which is exactly when mutual reveal fires.
  if new.kind = 'event' then
    select exists (
      select 1 from public.reviews
       where inquiry_id = new.inquiry_id
         and kind = 'event'
         and rater_role <> new.rater_role
    ) into v_just_released;
  end if;

  -- ─── Event review, mutual reveal just happened ──────────────────
  -- Notify BOTH sides. Body is generic (no rating) — the reader can
  -- click through. This is the "you can see each other's reviews now"
  -- moment.
  if new.kind = 'event' and v_just_released then
    -- Host
    insert into public.notifications (user_id, type, title, body, link, actor_image_url)
    values (
      new.host_id,
      'review_released',
      'Reviews are live',
      'Both sides reviewed — your event reviews are now visible.',
      v_link_host,
      v_actor_image
    );
    -- Vendor team
    insert into public.notifications (user_id, type, title, body, link, actor_image_url)
    select
      m.user_id,
      'review_released',
      'Reviews are live',
      'Both sides reviewed — your event reviews are now visible.',
      v_link_vendor,
      v_actor_image
    from public.vendor_team_members m
    where m.vendor_id = new.vendor_id
      and public.is_notif_enabled(m.user_id, 'review_received');
    return new;
  end if;

  -- ─── Event review, first side (blind ping) ──────────────────────
  -- Notify the OTHER side with no rating / body. They need to know a
  -- review exists so they're prompted to write theirs.
  if new.kind = 'event' and not v_just_released then
    if new.rater_role = 'host' then
      insert into public.notifications (user_id, type, title, body, link, actor_image_url)
      select
        m.user_id,
        'review_received_blind',
        v_actor_name || ' left you a review',
        'Yours stays hidden until you review them too — or it goes live in 14 days.',
        v_link_vendor,
        v_actor_image
      from public.vendor_team_members m
      where m.vendor_id = new.vendor_id
        and public.is_notif_enabled(m.user_id, 'review_received');
    else
      insert into public.notifications (user_id, type, title, body, link, actor_image_url)
      values (
        new.host_id,
        'review_received_blind',
        v_actor_name || ' left you a review',
        'Yours stays hidden until you review them too — or it goes live in 14 days.',
        v_link_host,
        v_actor_image
      );
    end if;
    return new;
  end if;

  -- ─── Conversation rating ────────────────────────────────────────
  -- Released immediately. Notify the rated party with rating + body
  -- preview so they get a real signal in their inbox.
  if new.kind = 'conversation' then
    if new.rater_role = 'host' then
      insert into public.notifications (user_id, type, title, body, link, actor_image_url)
      select
        m.user_id,
        'conversation_rating_received',
        v_actor_name || ' rated this conversation ' || new.rating::text || '/5',
        coalesce(left(new.body, 140), 'No written feedback.'),
        v_link_vendor,
        v_actor_image
      from public.vendor_team_members m
      where m.vendor_id = new.vendor_id
        and public.is_notif_enabled(m.user_id, 'review_received');
    else
      insert into public.notifications (user_id, type, title, body, link, actor_image_url)
      values (
        new.host_id,
        'conversation_rating_received',
        v_actor_name || ' rated this conversation ' || new.rating::text || '/5',
        coalesce(left(new.body, 140), 'No written feedback.'),
        v_link_host,
        v_actor_image
      );
    end if;
  end if;

  return new;
end
$$;

-- Function is invoked by the existing reviews_notify_posted trigger
-- (created in 20260503080733_notifications.sql). Same trigger name,
-- new body — no DROP/CREATE on the trigger itself needed.
revoke execute on function public.notify_review_posted() from public, anon, authenticated, service_role;
