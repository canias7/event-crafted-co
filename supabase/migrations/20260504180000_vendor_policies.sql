-- Cancellation / deposit / reschedule policy summary on vendor
-- profiles. Surfaced as small badges on the public profile + on
-- proposals so hosts know the terms before booking.
--
-- We use small enums instead of free text so we can render
-- consistent UI across all vendors and aggregate stats later
-- ("most flexible cancellation in the area" etc.).

alter table public.vendor_profiles
  add column if not exists deposit_pct integer
    check (deposit_pct is null or (deposit_pct >= 0 and deposit_pct <= 100)),
  add column if not exists cancellation_policy text
    check (cancellation_policy is null or cancellation_policy in (
      'flexible',     -- full refund > 30 days out
      'moderate',     -- partial refund > 30 days out
      'strict',       -- non-refundable deposit, balance refundable
      'non_refundable' -- nothing refundable
    )),
  add column if not exists reschedule_window_days integer
    check (reschedule_window_days is null or reschedule_window_days >= 0),
  add column if not exists policy_notes text;
