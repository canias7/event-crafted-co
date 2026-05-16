-- Orphan trigger: profiles.calendar_feed_token column was dropped
-- in an earlier migration, but the BEFORE INSERT trigger + its
-- function were left behind. Every new signup tripped it with
-- ERROR: record "new" has no field "calendar_feed_token", which
-- aborted the auth.users INSERT (handle_new_user fan-out) and
-- surfaced as "Database error saving new user" on the client.

drop trigger if exists profiles_calendar_feed_token on public.profiles;
drop function if exists public.tg_set_calendar_feed_token();
