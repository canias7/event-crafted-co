-- Revoke EXECUTE on internal SECURITY DEFINER functions from the
-- anon / authenticated / public grants the linter keeps flagging.
--
-- Three buckets:
--
-- (a) Pure trigger functions — only fired by the DB engine on a row
--     event. The user never needs EXECUTE to make the trigger run, so
--     they can be revoked from everyone (including service_role) with
--     no behavioral change.
--
-- (b) Admin-only and cron-only RPCs — only called by the admin app
--     (gated by is_admin() inside the function) or by cron-driven
--     edge functions running with the service-role key. Revoke from
--     authenticated/anon, keep service_role.
--
-- (c) pgmq queue wrappers — only used by the email worker which runs
--     under service_role. Revoke from authenticated/anon.
--
-- RLS helpers (is_admin, is_vendor_owner, …) and the user-facing
-- RPCs (apply_as_vendor, accept_*_invite, submit_rsvp, get_*_by_token,
-- …) keep their authenticated/anon grants because the apps call them
-- directly.

------------------------------------------------------------------------
-- (a) Trigger-only functions
------------------------------------------------------------------------
revoke execute on function public.accept_proposal_side_effects()              from public, anon, authenticated, service_role;
revoke execute on function public.audit_review_hidden()                       from public, anon, authenticated, service_role;
revoke execute on function public.audit_support_status()                      from public, anon, authenticated, service_role;
revoke execute on function public.audit_vendor_verified_change()              from public, anon, authenticated, service_role;
revoke execute on function public.audit_verification_decision()               from public, anon, authenticated, service_role;
revoke execute on function public.ensure_vendor_profile_for_vendor_role()     from public, anon, authenticated, service_role;
revoke execute on function public.fanout_appointment_to_calendar()            from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_user()                           from public, anon, authenticated, service_role;
revoke execute on function public.notify_admins_new_verification()            from public, anon, authenticated, service_role;
revoke execute on function public.notify_admins_support_event()               from public, anon, authenticated, service_role;
revoke execute on function public.notify_appointment_proposed()               from public, anon, authenticated, service_role;
revoke execute on function public.notify_appointment_status()                 from public, anon, authenticated, service_role;
revoke execute on function public.notify_direct_message()                     from public, anon, authenticated, service_role;
revoke execute on function public.notify_host_album_published()               from public, anon, authenticated, service_role;
revoke execute on function public.notify_host_party_accepted()                from public, anon, authenticated, service_role;
revoke execute on function public.notify_inquiry_created()                    from public, anon, authenticated, service_role;
revoke execute on function public.notify_inquiry_status()                     from public, anon, authenticated, service_role;
revoke execute on function public.notify_mood_board_comment()                 from public, anon, authenticated, service_role;
revoke execute on function public.notify_new_message()                        from public, anon, authenticated, service_role;
revoke execute on function public.notify_partner_message()                    from public, anon, authenticated, service_role;
revoke execute on function public.notify_proposal_sent()                      from public, anon, authenticated, service_role;
revoke execute on function public.notify_review_posted()                      from public, anon, authenticated, service_role;
revoke execute on function public.notify_review_response()                    from public, anon, authenticated, service_role;
revoke execute on function public.notify_user_support_admin_reply()           from public, anon, authenticated, service_role;
revoke execute on function public.notify_vendor_verification_decided()        from public, anon, authenticated, service_role;
revoke execute on function public.tg_bump_direct_thread_last_message()        from public, anon, authenticated, service_role;
revoke execute on function public.tg_bump_partner_thread_last_message()       from public, anon, authenticated, service_role;
revoke execute on function public.tg_inquiries_apply_lead_rules()             from public, anon, authenticated, service_role;
revoke execute on function public.tg_profiles_lock_role()                     from public, anon, authenticated, service_role;
revoke execute on function public.tg_profiles_suspend_mirror()                from public, anon, authenticated, service_role;
revoke execute on function public.tg_vendor_profiles_add_owner()              from public, anon, authenticated, service_role;
revoke execute on function public.tg_vendor_profiles_bump_role()              from public, anon, authenticated, service_role;
revoke execute on function public.tg_vendor_profiles_role_promote()           from public, anon, authenticated, service_role;

------------------------------------------------------------------------
-- (b) Admin-only RPCs (function still checks is_admin() internally;
-- this is defense-in-depth)
------------------------------------------------------------------------
revoke execute on function public.admin_delete_user(p_user_id uuid)                                 from public, anon, authenticated;
revoke execute on function public.admin_list_users()                                                 from public, anon, authenticated;
revoke execute on function public.admin_list_vendor_applications(p_status text)                      from public, anon, authenticated;
revoke execute on function public.log_admin_action(p_action text, p_target_type text, p_target_id uuid, p_summary text, p_metadata jsonb)
                                                                                                     from public, anon, authenticated;
revoke execute on function public.get_email_daily_volume(p_window_days integer)                      from public, anon, authenticated;
revoke execute on function public.get_email_deliverability_summary(p_window_days integer)            from public, anon, authenticated;

------------------------------------------------------------------------
-- (b) Cron-only RPCs (only the scan-* edge functions call these via
-- service_role; nobody should be able to flip prod state by hand)
------------------------------------------------------------------------
revoke execute on function public.expire_stale_inquiries(p_after_days integer)                       from public, anon, authenticated;
revoke execute on function public.recompute_vendor_responder_tiers(p_window_days integer, p_fast_hours numeric, p_min_replies integer)
                                                                                                     from public, anon, authenticated;
revoke execute on function public.enqueue_pending_digests(p_lookback_hours integer)                  from public, anon, authenticated;
revoke execute on function public.enqueue_pending_review_prompts(p_after_days integer)               from public, anon, authenticated;
revoke execute on function public.enqueue_saved_search_matches()                                     from public, anon, authenticated;
revoke execute on function public.enqueue_vendor_onboarding_nudges(p_min_age_days integer, p_cooldown_days integer)
                                                                                                     from public, anon, authenticated;
revoke execute on function public.enqueue_vendor_weekly_digests(p_window_days integer)               from public, anon, authenticated;
revoke execute on function public.find_reengagement_opportunities()                                  from public, anon, authenticated;

------------------------------------------------------------------------
-- (c) pgmq email queue helpers — only the worker uses these
------------------------------------------------------------------------
revoke execute on function public.enqueue_email(queue_name text, payload jsonb)                      from public, anon, authenticated;
revoke execute on function public.read_email_batch(queue_name text, batch_size integer, vt integer)  from public, anon, authenticated;
revoke execute on function public.delete_email(queue_name text, message_id bigint)                   from public, anon, authenticated;
revoke execute on function public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
                                                                                                     from public, anon, authenticated;
