-- Lock the search_path on the 13 legacy functions still flagged by the
-- "function_search_path_mutable" advisor. None of these use unqualified
-- references to objects outside public (the pgmq wrappers explicitly
-- qualify pgmq.send / pgmq.delete / pgmq.read / pgmq.create), so
-- pinning search_path = public is a no-op for current behavior but
-- closes the search-path-hijack vector the linter is warning about.

alter function public.tg_set_updated_at()               set search_path = public;
alter function public.tg_set_calendar_feed_token()      set search_path = public;
alter function public.slugify_vendor_name(p_name text)  set search_path = public;
alter function public.enforce_proposal_signature()      set search_path = public;
alter function public.set_default_meeting_url()         set search_path = public;
alter function public.generate_real_event_slug(p_title text, p_id uuid)
                                                        set search_path = public;
alter function public.tg_set_vendor_slug()              set search_path = public;
alter function public.host_inquiry_templates_touch()    set search_path = public;
alter function public.proposal_templates_touch()        set search_path = public;

alter function public.enqueue_email(queue_name text, payload jsonb)
                                                        set search_path = public;
alter function public.read_email_batch(queue_name text, batch_size integer, vt integer)
                                                        set search_path = public;
alter function public.delete_email(queue_name text, message_id bigint)
                                                        set search_path = public;
alter function public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
                                                        set search_path = public;
