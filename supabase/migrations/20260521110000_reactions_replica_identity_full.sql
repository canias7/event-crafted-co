-- Reactions are hard-deleted (no soft-delete column). Without
-- REPLICA IDENTITY FULL, Postgres only ships the PK on DELETE
-- events — realtime subscribers with `user_id=eq.<uuid>` or
-- `message_id=eq.<uuid>` filters can't match because those columns
-- aren't in the payload. Result: a user removing their reaction in
-- tab A never disappears from tab B until a full page refresh.
--
-- FULL ships the entire OLD row so the filter sees the columns.

alter table public.direct_message_reactions replica identity full;
alter table public.vendor_partner_message_reactions replica identity full;
