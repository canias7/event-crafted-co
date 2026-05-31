-- Reviews now require an in-app purchase. A review (event OR conversation)
-- can only be left on an inquiry where the host actually paid through the
-- app — i.e. a pay link tied to the inquiry reached 'paid', which the
-- webhook records as inquiries.paid_booked_at.
--
-- Why a dedicated column (not a join to payment_links): the reviews gate
-- trigger is SECURITY INVOKER (runs as the caller) and hosts have NO read
-- access to payment_links under RLS. inquiries IS host-readable, so the
-- host's own review insert can see paid_booked_at. The webhook (service
-- role) stamps it.
--
-- paid_booked_at is set once and never cleared on refund — a host who
-- paid keeps the right to review even if later refunded (refund/cancel is
-- itself review-worthy; otherwise a vendor could refund to silence a bad
-- review).
--
-- The off-platform booking handshake (host/vendor_confirmed_booked_at)
-- still books the inquiry (pipeline/calendar) but NO LONGER unlocks
-- reviews — only a real in-app payment does.

alter table public.inquiries
  add column if not exists paid_booked_at timestamptz;

create or replace function public.tg_reviews_gate_and_release()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_thread_id uuid;
  v_msg_count int;
  v_event_date date;
  v_inquiry_host uuid;
  v_inquiry_vendor uuid;
  v_paid_booked boolean;
begin
  select host_id, vendor_id, event_date,
         paid_booked_at is not null
    into v_inquiry_host, v_inquiry_vendor, v_event_date, v_paid_booked
    from public.inquiries
   where id = new.inquiry_id;
  if v_inquiry_host is null then
    raise exception 'inquiry_not_found';
  end if;

  -- Identity / authorization (unchanged).
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

  -- ALL reviews now require an in-app purchase on this inquiry.
  if not coalesce(v_paid_booked, false) then
    raise exception 'purchase_required';
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
    -- Event reviews open the DAY AFTER the event ends.
    if v_event_date is null then
      raise exception 'no_event_date';
    end if;
    if v_event_date >= current_date then
      raise exception 'event_too_recent';
    end if;
  end if;

  return new;
end
$function$;
