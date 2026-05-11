-- The mobile + web thread screens subscribe to direct_messages INSERT
-- events to show new messages in-line. supabase_realtime is the
-- changefeed publication; tables not in it produce no events.
--
-- direct_messages was missing from the publication, so the realtime
-- channel was silent and new messages only appeared on tab reload.
-- Adding it now. direct_threads goes in too so a freshly-created
-- thread (the find-or-create RPC) can stream into open inbox lists.

alter publication supabase_realtime add table public.direct_messages;
alter publication supabase_realtime add table public.direct_threads;
