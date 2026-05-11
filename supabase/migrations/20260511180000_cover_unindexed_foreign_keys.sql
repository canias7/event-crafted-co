-- Cover the 42 unindexed foreign keys the perf advisor keeps flagging.
-- Each FK without a leading-column index causes:
--   1) child-side ON DELETE CASCADE checks to scan the whole table
--   2) join-on-FK queries to scan instead of index-seek
-- Symptoms invisible at <100k rows, ugly above that.
--
-- All indexes are btree on a single FK column. IF NOT EXISTS keeps the
-- migration idempotent in case someone added an index manually in the
-- meantime. vendor_post_comments.user_id has two FK constraints
-- pointing to different parents — one index covers both.

create index if not exists ai_agent_runs_inquiry_id_idx          on public.ai_agent_runs (inquiry_id);
create index if not exists appointments_inquiry_id_idx           on public.appointments (inquiry_id);
create index if not exists budget_items_vendor_id_idx            on public.budget_items (vendor_id);
create index if not exists content_reports_resolved_by_idx       on public.content_reports (resolved_by);
create index if not exists direct_messages_sender_id_idx         on public.direct_messages (sender_id);
create index if not exists direct_threads_inquiry_id_idx         on public.direct_threads (inquiry_id);
create index if not exists editorial_articles_author_id_idx      on public.editorial_articles (author_id);
create index if not exists event_albums_event_id_idx             on public.event_albums (event_id);
create index if not exists event_albums_inquiry_id_idx           on public.event_albums (inquiry_id);
create index if not exists event_channel_messages_sender_id_idx  on public.event_channel_messages (sender_id);
create index if not exists event_party_tasks_event_id_idx        on public.event_party_tasks (event_id);
create index if not exists event_timeline_items_vendor_id_idx    on public.event_timeline_items (vendor_id);
create index if not exists host_reliability_flags_inquiry_id_idx on public.host_reliability_flags (inquiry_id);
create index if not exists messages_sender_id_idx                on public.messages (sender_id);
create index if not exists mood_board_comments_author_id_idx     on public.mood_board_comments (author_id);
create index if not exists planning_invites_invited_by_idx       on public.planning_invites (invited_by);
create index if not exists profiles_active_event_id_idx          on public.profiles (active_event_id);
create index if not exists proposals_contract_template_id_idx    on public.proposals (contract_template_id);
create index if not exists proposals_host_id_idx                 on public.proposals (host_id);
create index if not exists real_events_inquiry_id_idx            on public.real_events (inquiry_id);
create index if not exists review_requests_inquiry_id_idx        on public.review_requests (inquiry_id);
create index if not exists review_responses_vendor_id_idx        on public.review_responses (vendor_id);
create index if not exists saved_vendors_vendor_id_idx           on public.saved_vendors (vendor_id);
create index if not exists support_messages_sender_id_idx        on public.support_messages (sender_id);
create index if not exists support_tickets_assigned_admin_id_idx on public.support_tickets (assigned_admin_id);
create index if not exists vendor_bundle_members_vendor_id_idx   on public.vendor_bundle_members (vendor_id);
create index if not exists vendor_buzz_user_id_idx               on public.vendor_buzz (user_id);
create index if not exists vendor_claim_invitations_invited_by_idx
                                                                 on public.vendor_claim_invitations (invited_by);
create index if not exists vendor_partner_messages_sender_vendor_id_idx
                                                                 on public.vendor_partner_messages (sender_vendor_id);
create index if not exists vendor_post_comment_likes_user_id_idx on public.vendor_post_comment_likes (user_id);
create index if not exists vendor_post_comments_user_id_idx      on public.vendor_post_comments (user_id);
create index if not exists vendor_posts_user_id_idx              on public.vendor_posts (user_id);
create index if not exists vendor_profile_views_viewer_id_idx    on public.vendor_profile_views (viewer_id);
create index if not exists vendor_profiles_application_reviewed_by_idx
                                                                 on public.vendor_profiles (application_reviewed_by);
create index if not exists vendor_profiles_user_id_idx           on public.vendor_profiles (user_id);
create index if not exists vendor_reels_user_id_idx              on public.vendor_reels (user_id);
create index if not exists vendor_reengagement_log_host_id_idx   on public.vendor_reengagement_log (host_id);
create index if not exists vendor_reengagement_log_inquiry_id_idx
                                                                 on public.vendor_reengagement_log (inquiry_id);
create index if not exists vendor_referrals_referred_id_idx      on public.vendor_referrals (referred_id);
create index if not exists vendor_team_invites_invited_by_idx    on public.vendor_team_invites (invited_by);
create index if not exists vendor_verifications_reviewed_by_idx  on public.vendor_verifications (reviewed_by);
