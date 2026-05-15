-- Mirror host portal to mobile app: drop everything in the DB that
-- supported web-only host features (planner workspace, mood boards,
-- gift registry, microsite editor, guest list, checklist, budget,
-- party portal, etc.). Mobile never had these surfaces and the web UI
-- was deleted in PRs #307 and #308. This migration is recorded for
-- replay parity — actual application was via Supabase MCP
-- apply_migration calls (drop_orphan_host_planner_tables,
-- drop_orphan_host_rpcs_and_triggers, drop_remaining_orphan_rpcs,
-- harden_search_path_and_explicit_deny).

-- 1) Drop tables (cascade clears child triggers + FKs).
drop table if exists public.guest_message_blasts          cascade;
drop table if exists public.event_party_invites            cascade;
drop table if exists public.event_party_tasks              cascade;
drop table if exists public.event_channel_messages         cascade;
drop table if exists public.event_channels                 cascade;
drop table if exists public.event_timeline_items           cascade;
drop table if exists public.event_registry_links           cascade;
drop table if exists public.gift_pledges                   cascade;
drop table if exists public.gift_wishes                    cascade;
drop table if exists public.mood_board_comments            cascade;
drop table if exists public.mood_board_items               cascade;
drop table if exists public.mood_boards                    cascade;
drop table if exists public.checklist_items                cascade;
drop table if exists public.event_tasks                    cascade;
drop table if exists public.event_tables                   cascade;
drop table if exists public.event_guests                   cascade;
drop table if exists public.event_microsite_photos         cascade;
drop table if exists public.event_microsite_rsvps          cascade;
drop table if exists public.event_album_photos             cascade;
drop table if exists public.event_albums                   cascade;
drop table if exists public.saved_searches                 cascade;
drop table if exists public.budget_items                   cascade;
drop table if exists public.planning_invites               cascade;
drop table if exists public.planning_collaborators         cascade;
drop table if exists public.host_events                    cascade;

-- 2) Drop legacy multi-event hint columns from profiles.
alter table public.profiles
  drop column if exists active_event_id,
  drop column if exists event_type,
  drop column if exists event_date,
  drop column if exists event_location,
  drop column if exists budget_min_cents,
  drop column if exists budget_max_cents,
  drop column if exists event_notes,
  drop column if exists calendar_feed_token;

-- 3) Drop RPCs / triggers that referenced any of the above tables.
drop function if exists public.accept_party_invite(text)                cascade;
drop function if exists public.accept_planning_invite(text)             cascade;
drop function if exists public.enqueue_saved_search_matches()           cascade;
drop function if exists public.get_album_by_token(text)                 cascade;
drop function if exists public.get_calendar_feed_by_token(text)         cascade;
drop function if exists public.get_gift_wish_by_token(text)             cascade;
drop function if exists public.get_guest_by_token(text)                 cascade;
drop function if exists public.get_microsite_by_token(text)             cascade;
drop function if exists public.get_microsite_rsvp_config(text)          cascade;
drop function if exists public.get_mood_board_by_token(text)            cascade;
drop function if exists public.get_mood_board_comments_by_token(text)   cascade;
drop function if exists public.get_party_invite_by_token(text)          cascade;
drop function if exists public.get_party_portal(uuid)                   cascade;
drop function if exists public.get_planner_workspace()                  cascade;
drop function if exists public.get_planner_workspace(uuid)              cascade;
drop function if exists public.get_planning_invite_by_token(text)       cascade;
drop function if exists public.is_planning_collaborator(uuid)           cascade;
drop function if exists public.is_planning_editor(uuid)                 cascade;
drop function if exists public.list_my_party_events()                   cascade;
drop function if exists public.notify_mood_board_comment()              cascade;
drop function if exists public.pledge_to_gift(text, text, text, integer)            cascade;
drop function if exists public.pledge_to_gift(text, text, integer, text, text)      cascade;
drop function if exists public.set_active_event(uuid)                   cascade;
drop function if exists public.submit_microsite_rsvp(text, jsonb)       cascade;
drop function if exists public.submit_microsite_rsvp(text, text, text, boolean, integer, text, jsonb) cascade;
drop function if exists public.submit_rsvp(text, jsonb)                 cascade;
drop function if exists public.submit_rsvp(text, text, boolean, text, text) cascade;
drop function if exists public.tg_event_album_photo_storage_cleanup()   cascade;
drop function if exists public.tg_event_album_storage_cleanup()         cascade;
drop function if exists public.tg_mood_board_item_storage_cleanup()     cascade;

-- 4) Defensive deny-all policies on intentionally-no-policy tables so
--    future audits don't flag them. (host_signup_codes, vendor_signup_codes,
--    signin_2fa_codes, mobile_debug_events are all service-role-only.)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='host_signup_codes' and policyname='host_signup_codes deny all') then
    execute 'create policy "host_signup_codes deny all" on public.host_signup_codes for all to authenticated, anon using (false) with check (false)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vendor_signup_codes' and policyname='vendor_signup_codes deny all') then
    execute 'create policy "vendor_signup_codes deny all" on public.vendor_signup_codes for all to authenticated, anon using (false) with check (false)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='signin_2fa_codes' and policyname='signin_2fa_codes deny all') then
    execute 'create policy "signin_2fa_codes deny all" on public.signin_2fa_codes for all to authenticated, anon using (false) with check (false)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mobile_debug_events' and policyname='mobile_debug_events deny all') then
    execute 'create policy "mobile_debug_events deny all" on public.mobile_debug_events for all to authenticated, anon using (false) with check (false)';
  end if;
end $$;

-- 5) Pin search_path on the one trigger flagged by the linter.
create or replace function public.tg_email_leads_touch_updated()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin new.updated_at := now(); return new; end
$function$;

-- 6) Storage buckets event-albums, event-microsites, mood-board-images
--    were dropped via the Storage Management API (the storage schema
--    has a delete-protection trigger that blocks direct SQL).
