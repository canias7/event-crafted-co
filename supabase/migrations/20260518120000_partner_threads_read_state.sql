-- Per-participant read state on vendor partner threads, so the
-- /vendor/partners list can light an iMessage-style unread dot when
-- the other side has sent a message I haven't opened yet.
--
-- Two columns (one per side) instead of a join table, mirroring the
-- inquiries.vendor_read_at pattern — simple, indexed by the same
-- thread row we already fetch.
--
-- Existing threads are backfilled to last_message_at so nobody gets
-- blasted with a dot on every old thread the moment this ships.

alter table public.vendor_partner_threads
  add column if not exists user_a_read_at timestamptz,
  add column if not exists user_b_read_at timestamptz;

update public.vendor_partner_threads
  set user_a_read_at = coalesce(user_a_read_at, last_message_at),
      user_b_read_at = coalesce(user_b_read_at, last_message_at);

-- The existing "vendor_partner_threads participants update" policy
-- already allows either participant to update the thread row, so we
-- don't need a new policy for the read-at columns. The UI writes the
-- column matching the caller's side.
