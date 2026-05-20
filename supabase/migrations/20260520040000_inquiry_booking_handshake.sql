-- Off-platform booking handshake. The event-review gate today only
-- unlocks when an accepted proposal exists for the inquiry, which
-- silently excludes the large share of real bookings that close
-- outside the app (Venmo deposit, phone call, in-person). Those
-- hosts had the vendor at their event but can't review — the
-- single most-important trust signal is invisible to the only
-- people who could supply it.
--
-- Add a two-sided handshake: each party stamps their side ("yes,
-- we did work together"). When both stamps land, the gate trigger
-- treats the inquiry as booked, same as an accepted proposal.
-- Both-sides confirmation is non-negotiable — a one-sided mark
-- would let either party fabricate a booking with a counterparty
-- they never used and dent that party's score.

alter table public.inquiries
  add column if not exists host_confirmed_booked_at timestamptz,
  add column if not exists vendor_confirmed_booked_at timestamptz;

-- RPC: caller stamps their own side. Idempotent — second click is
-- a no-op. Inference of which side from auth.uid() matches the
-- inquiry's host_id or the caller's vendor membership. If somehow
-- both apply (same user is both host and vendor team member),
-- prefer host since this UI lives primarily on the host page.
create or replace function public.mark_inquiry_booked(p_inquiry_id uuid)
returns public.inquiries
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_inquiry public.inquiries;
  v_is_host boolean;
  v_is_vendor boolean;
begin
  select * into v_inquiry from public.inquiries where id = p_inquiry_id;
  if v_inquiry.id is null then
    raise exception 'not_found';
  end if;

  v_is_host := (select auth.uid()) = v_inquiry.host_id;
  v_is_vendor := public.is_vendor_member(v_inquiry.vendor_id);

  if not v_is_host and not v_is_vendor then
    raise exception 'not_authorized';
  end if;

  if v_is_host then
    update public.inquiries
       set host_confirmed_booked_at = coalesce(host_confirmed_booked_at, now())
     where id = p_inquiry_id
     returning * into v_inquiry;
  elsif v_is_vendor then
    update public.inquiries
       set vendor_confirmed_booked_at = coalesce(vendor_confirmed_booked_at, now())
     where id = p_inquiry_id
     returning * into v_inquiry;
  end if;

  return v_inquiry;
end
$$;

grant execute on function public.mark_inquiry_booked(uuid) to authenticated;

-- Update gate trigger: event review unlocks if EITHER an accepted
-- proposal exists OR both parties confirmed the booking. Keep the
-- existing error code 'no_accepted_proposal' on the wire; the
-- client RatingModal label will be updated to mention both paths.
create or replace function public.tg_reviews_gate_and_release()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_thread_id uuid;
  v_msg_count int;
  v_event_date date;
  v_inquiry_host uuid;
  v_inquiry_vendor uuid;
  v_proposal_ok boolean;
  v_booked_offplatform boolean;
begin
  select host_id, vendor_id, event_date,
         host_confirmed_booked_at is not null
           and vendor_confirmed_booked_at is not null
    into v_inquiry_host, v_inquiry_vendor, v_event_date,
         v_booked_offplatform
    from public.inquiries
   where id = new.inquiry_id;
  if v_inquiry_host is null then
    raise exception 'inquiry_not_found';
  end if;

  if new.rater_role = 'host' then
    if new.host_id is null or new.host_id <> v_inquiry_host then
      raise exception 'host_mismatch';
    end if;
    if (select auth.uid()) <> v_inquiry_host then
      raise exception 'not_authorized';
    end if;
  elsif new.rater_role = 'vendor' then
    if new.vendor_id is null or new.vendor_id <> v_inquiry_vendor then
      raise exception 'vendor_mismatch';
    end if;
    if not public.is_vendor_member(v_inquiry_vendor) then
      raise exception 'not_authorized';
    end if;
  end if;

  if new.kind = 'conversation' then
    select dt.id into v_thread_id
      from public.direct_threads dt where dt.inquiry_id = new.inquiry_id;
    if v_thread_id is null then
      raise exception 'no_thread';
    end if;
    select count(*) into v_msg_count
      from public.direct_messages where thread_id = v_thread_id;
    if v_msg_count < 6 then
      raise exception 'min_messages_required';
    end if;
    new.released_at := coalesce(new.released_at, now());
  elsif new.kind = 'event' then
    select exists (
      select 1 from public.proposals
       where inquiry_id = new.inquiry_id and status = 'accepted'
    ) into v_proposal_ok;
    if not coalesce(v_proposal_ok, false)
       and not coalesce(v_booked_offplatform, false) then
      raise exception 'no_accepted_proposal';
    end if;
    if v_event_date is null then
      raise exception 'no_event_date';
    end if;
    if v_event_date > current_date - interval '3 days' then
      raise exception 'event_too_recent';
    end if;
  end if;

  return new;
end
$$;

-- Notify the counterparty when one side stamps. When the second
-- side stamps, notify the first side that the booking is now
-- confirmed and event reviews are open. Skip work if neither
-- column actually transitioned null→set on this update.
create or replace function public.tg_inquiry_booking_confirmation_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_host_just_stamped boolean := old.host_confirmed_booked_at is null
                                  and new.host_confirmed_booked_at is not null;
  v_vendor_just_stamped boolean := old.vendor_confirmed_booked_at is null
                                    and new.vendor_confirmed_booked_at is not null;
  v_both_now_set boolean := new.host_confirmed_booked_at is not null
                             and new.vendor_confirmed_booked_at is not null;
  v_link_host text;
  v_link_vendor text;
  v_host_name text;
  v_vendor_name text;
begin
  if not v_host_just_stamped and not v_vendor_just_stamped then
    return new;
  end if;

  v_link_host := '/customer/inquiries/' || new.id::text;
  v_link_vendor := '/vendor/inbox/' || new.id::text;

  select coalesce(display_name, 'A host') into v_host_name
    from public.profiles where id = new.host_id;
  select coalesce(business_name, 'A vendor') into v_vendor_name
    from public.vendor_profiles where id = new.vendor_id;

  if v_host_just_stamped then
    if v_both_now_set then
      insert into public.notifications (user_id, type, title, body, link)
      select m.user_id,
             'booking_confirmed',
             'Booking confirmed',
             v_host_name || ' confirmed the booking. Event reviews are open.',
             v_link_vendor
        from public.vendor_team_members m
       where m.vendor_id = new.vendor_id;
    else
      insert into public.notifications (user_id, type, title, body, link)
      select m.user_id,
             'booking_confirmation_requested',
             v_host_name || ' says you worked together',
             'Confirm to unlock event reviews on both sides.',
             v_link_vendor
        from public.vendor_team_members m
       where m.vendor_id = new.vendor_id;
    end if;
  end if;

  if v_vendor_just_stamped then
    if v_both_now_set then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.host_id,
              'booking_confirmed',
              'Booking confirmed',
              v_vendor_name || ' confirmed the booking. Event reviews are open.',
              v_link_host);
    else
      insert into public.notifications (user_id, type, title, body, link)
      values (new.host_id,
              'booking_confirmation_requested',
              v_vendor_name || ' says you worked together',
              'Confirm to unlock event reviews on both sides.',
              v_link_host);
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists inquiry_booking_confirmation_notify on public.inquiries;
create trigger inquiry_booking_confirmation_notify
  after update of host_confirmed_booked_at, vendor_confirmed_booked_at
  on public.inquiries
  for each row
  execute function public.tg_inquiry_booking_confirmation_notify();
