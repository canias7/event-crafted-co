-- Follow-up audit fixes for the gallery.
--
-- 1. Drop resolve_gallery_share. get_share_payload from the
--    previous migration replaces it end-to-end (validates token +
--    password, returns share kind + non-sensitive image data in
--    one round-trip). Keeping the old RPC around made it possible
--    for future UI to wire to the wrong surface.
--
-- 2. REPLICA IDENTITY FULL on the two gallery tables. Postgres
--    realtime only includes the primary key in DELETE payloads by
--    default — the user_id=eq.<uuid> filter on the client side
--    therefore never matches a DELETE event, so a delete in tab A
--    never refreshes tab B. REPLICA IDENTITY FULL ships the entire
--    OLD row with each change, including user_id, so the filter
--    works for DELETEs too.

drop function if exists public.resolve_gallery_share(text, text);

alter table public.vendor_gallery_images replica identity full;
alter table public.vendor_gallery_albums replica identity full;
