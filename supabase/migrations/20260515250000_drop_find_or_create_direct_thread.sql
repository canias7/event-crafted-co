-- Mobile never had a "DM vendor without filing an inquiry" path.
-- Web's only consumer of find_or_create_direct_thread was the
-- VendorDetailPage "Message vendor" button. With that button now
-- routing hosts into the inquiry composer (mirrors mobile), this
-- RPC has no callers.
drop function if exists public.find_or_create_direct_thread(uuid) cascade;
