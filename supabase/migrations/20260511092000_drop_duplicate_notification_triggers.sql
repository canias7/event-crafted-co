-- Earlier in this session (20260510224500_inquiry_and_message_notifications.sql)
-- I added two triggers without realizing equivalents already existed:
--
--   inquiries_notify_vendor          (mine)   →  inquiries_notify_created (pre-existing)
--   direct_messages_notify_other     (mine)   →  direct_messages_notify   (pre-existing)
--
-- Result: every inquiry + every direct message inserted TWO rows into
-- public.notifications, which fanned out as duplicate push banners
-- ("X sent you a message" + "New message from X" for the same event).
--
-- The pre-existing functions are also more capable — notify_direct_message
-- fans out to every vendor_team_members row, not just the vendor_profiles
-- owner. Dropping mine; keeping the original pair.

drop trigger if exists inquiries_notify_vendor on public.inquiries;
drop function if exists public.tg_inquiry_notify_vendor();

drop trigger if exists direct_messages_notify_other on public.direct_messages;
drop function if exists public.tg_direct_message_notify_other();
