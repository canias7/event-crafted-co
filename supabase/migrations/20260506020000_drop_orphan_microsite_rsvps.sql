-- Drop the orphan `microsite_rsvps` table.
--
-- Backstory: this branch's `20260504120000_microsite_rsvps.sql`
-- created `event_microsite_rsvps` with the canonical schema the
-- frontend uses (attending boolean, plus_ones, message, unique on
-- event_id+guest_email). Lovable's parallel work in
-- `20260505035545` later created a second table named
-- `microsite_rsvps` (different shape: status enum, party_size,
-- dietary). Frontend never reads or writes `microsite_rsvps`
-- after the canonical RPC restoration in `20260506000000` — it's
-- a pure orphan.
--
-- Drop it with `if exists` so this is a no-op on environments
-- where Lovable's migration didn't apply.

drop table if exists public.microsite_rsvps cascade;
