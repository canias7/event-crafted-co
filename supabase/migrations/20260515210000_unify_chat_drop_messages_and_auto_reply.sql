-- Unify the chat data model + drop dormant auto-reply feature.
--
-- Web had a parallel `messages` table (linked to inquiries.id) while
-- mobile routed every inquiry conversation through direct_threads /
-- direct_messages via ensure_inquiry_thread. The two never bridged;
-- a host on web and a vendor on mobile literally could not see each
-- other's replies. Both tables held 0 rows so this is the safe moment
-- to consolidate. Web pages were ported to call ensure_inquiry_thread
-- and read/write direct_messages — see the matching commit.
--
-- Auto-reply / auto-decline lead rules: feature was plumbed (DB
-- trigger + 4 vendor_profiles columns + LeadRulesCard.tsx) but never
-- wired into a vendor settings page, 0 vendors had it enabled, and
-- mobile has no equivalent. Mirror goal: delete the whole feature.

drop trigger if exists inquiries_apply_lead_rules on public.inquiries;
drop function if exists public.tg_inquiries_apply_lead_rules() cascade;

alter table public.vendor_profiles
  drop column if exists auto_reply_enabled,
  drop column if exists auto_reply_template,
  drop column if exists auto_decline_below_cents,
  drop column if exists auto_decline_message;

drop trigger if exists messages_notify_new on public.messages;
drop function if exists public.notify_new_message() cascade;
drop table if exists public.messages cascade;
