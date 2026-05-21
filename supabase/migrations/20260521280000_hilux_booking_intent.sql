-- HILUX booking-intent detection. When the host writes something
-- that reads as "yes, let's book us" (explicit commitment, not
-- just interest), HILUX flags the inquiry. Vendors can then filter
-- their inbox to "ready to close" without scrolling every thread.

alter table public.inquiries
  add column if not exists booking_intent_at timestamptz,
  add column if not exists booking_intent_reason text;

create index if not exists inquiries_booking_intent_idx
  on public.inquiries (booking_intent_at desc)
  where booking_intent_at is not null;
