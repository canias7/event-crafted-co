-- Every non-essential email honours a switch in Settings -> Notifications
-- (profiles.notification_prefs; a missing key = on, read through
-- public.is_notif_enabled(user, key)).
--
--   daily digest            -> 'daily_digest'
--   review prompts (hosts)  -> 'review_prompts'
--   onboarding nudges       -> 'onboarding_tips'
--   vendor weekly digest    -> 'weekly_digest' (the settings switch writes
--                              notification_prefs, the old function read
--                              vendor_profiles.weekly_digest_enabled, so the
--                              switch did nothing; now both must allow it)
--
-- Bodies are the production definitions as of 2026-10-13 with only the
-- preference filter added. CREATE OR REPLACE keeps the existing grants.
-- Also unschedules the cron for the retired scan-reengagement function
-- (it answers 410). Idempotent: safe to run more than once.

-- Daily digest: opted-out users' notifications are left alone (not marked
-- digested), so nothing goes out for them.
create or replace function public.enqueue_pending_digests(p_lookback_hours integer default 24)
returns table(user_id uuid, email text, display_name text, role text, notifications jsonb)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare v_ids uuid[];
begin
  with eligible as (
    update public.notifications n set digested_at = now()
    from public.profiles p
    where n.user_id = p.id
      and n.digested_at is null
      and n.read_at is null
      and n.created_at >= (now() - make_interval(hours => p_lookback_hours))
      and public.is_notif_enabled(p.id, 'daily_digest')
    returning n.id
  )
  select array_agg(id) into v_ids from eligible;
  if v_ids is null or array_length(v_ids, 1) = 0 then return; end if;
  return query
  select p.id, u.email, p.display_name, p.role,
    jsonb_agg(jsonb_build_object('type', n.type, 'title', n.title, 'body', n.body, 'link', n.link, 'created_at', n.created_at) order by n.created_at desc) as notifications
  from public.notifications n
  join public.profiles p on p.id = n.user_id
  left join auth.users u on u.id = p.id
  where n.id = any(v_ids)
  group by p.id, u.email, p.display_name, p.role;
end$function$;

-- Review prompts: every eligible inquiry is still marked prompted (so
-- turning the switch back on doesn't release a backlog of old events),
-- but hosts who turned review_prompts off get no bell entry and no email.
create or replace function public.enqueue_pending_review_prompts(p_after_days integer default 3)
returns table(inquiry_id uuid, host_id uuid, vendor_id uuid, vendor_name text, event_type text, event_date date, host_email text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_ids uuid[];
begin
  with eligible as (
    update public.inquiries i set review_prompt_sent_at = now()
    where i.status = 'won' and i.event_date is not null and i.event_date <= (current_date - make_interval(days => p_after_days)) and i.review_prompt_sent_at is null
      and not exists (select 1 from public.reviews r where r.inquiry_id = i.id and r.host_id = i.host_id)
    returning i.id
  ) select array_agg(id) into v_ids from eligible;
  if v_ids is null or array_length(v_ids, 1) = 0 then return; end if;
  insert into public.notifications (user_id, type, title, body, link)
  select i.host_id, 'review_prompt', coalesce(vp.business_name, 'Your vendor') || ' - leave a review?',
    'How was your ' || replace(i.event_type, '_', ' ') || '? Your review helps other hosts choose with confidence.',
    '/customer/inquiries/' || i.id::text
  from public.inquiries i left join public.vendor_profiles vp on vp.id = i.vendor_id
  where i.id = any(v_ids)
    and public.is_notif_enabled(i.host_id, 'review_prompts');
  return query
  select i.id, i.host_id, i.vendor_id, coalesce(vp.business_name, 'your vendor'), i.event_type, i.event_date, u.email
  from public.inquiries i left join public.vendor_profiles vp on vp.id = i.vendor_id left join auth.users u on u.id = i.host_id
  where i.id = any(v_ids)
    and public.is_notif_enabled(i.host_id, 'review_prompts');
end$function$;

-- Onboarding nudges: vendors who turned onboarding_tips off are skipped.
create or replace function public.enqueue_vendor_onboarding_nudges(p_min_age_days integer default 3, p_cooldown_days integer default 7)
returns table(vendor_id uuid, user_id uuid, business_name text, email text, missing_count integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_ids uuid[];
begin
  with eligible as (
    update public.vendor_profiles vp set onboarding_nudge_sent_at = now()
    where vp.created_at < (now() - make_interval(days => p_min_age_days))
      and (vp.onboarding_nudge_sent_at is null or vp.onboarding_nudge_sent_at < (now() - make_interval(days => p_cooldown_days)))
      and (coalesce(trim(vp.bio), '') = '' or coalesce(trim(vp.portfolio_summary), '') = '' or vp.location is null
        or not exists (select 1 from public.vendor_portfolio_images vpi where vpi.vendor_id = vp.id))
      and public.is_notif_enabled(vp.user_id, 'onboarding_tips')
    returning vp.id
  ) select array_agg(id) into v_ids from eligible;
  if v_ids is null or array_length(v_ids, 1) = 0 then return; end if;
  return query
  select vp.id, vp.user_id, vp.business_name, u.email,
    ((case when coalesce(trim(vp.bio), '') = '' then 1 else 0 end) +
     (case when coalesce(trim(vp.portfolio_summary), '') = '' then 1 else 0 end) +
     (case when vp.location is null then 1 else 0 end) +
     (case when not exists (select 1 from public.vendor_portfolio_images vpi where vpi.vendor_id = vp.id) then 1 else 0 end))::int
  from public.vendor_profiles vp left join auth.users u on u.id = vp.user_id where vp.id = any(v_ids);
end$function$;

-- Weekly digest: the settings switch (notification_prefs.weekly_digest)
-- AND the old column, so anyone who turned it off before stays off.
-- Also fixes three bugs that made the function error on every run, so no
-- weekly digest was ever sent (vendor_profiles.weekly_digest_sent_at is
-- null for everyone in production):
--   * unqualified `vendor_id` in the subqueries clashed with the OUT column
--     of the same name ("column reference is ambiguous"); use_column
--     resolves them to the table columns, which is what they mean;
--   * reply times read public.messages, which no longer exists; vendor
--     replies live in direct_messages (via direct_threads.inquiry_id);
--   * percentile_cont returns double precision but the column is numeric.
create or replace function public.enqueue_vendor_weekly_digests(p_window_days integer default 7)
returns table(vendor_id uuid, vendor_name text, recipient_email text, inquiries_new integer, inquiries_replied integer, bookings_new integer, reviews_new integer, median_response_hours numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_ids uuid[]; v_since timestamptz := now() - make_interval(days => p_window_days);
begin
  with eligible as (
    update public.vendor_profiles vp set weekly_digest_sent_at = now()
    where vp.weekly_digest_enabled = true
      and public.is_notif_enabled(vp.user_id, 'weekly_digest')
      and (vp.weekly_digest_sent_at is null or vp.weekly_digest_sent_at < (now() - interval '6 days'))
      and (exists (select 1 from public.inquiries where vendor_id = vp.id and created_at >= v_since)
        or exists (select 1 from public.reviews where vendor_id = vp.id and created_at >= v_since))
    returning vp.id
  ) select array_agg(id) into v_ids from eligible;
  if v_ids is null or array_length(v_ids, 1) = 0 then return; end if;
  return query
  with reply_times as (
    select i.vendor_id, i.id as inquiry_id, i.created_at as inquiry_at, min(m.created_at) as first_reply_at
    from public.inquiries i
    left join public.direct_threads t on t.inquiry_id = i.id
    left join public.direct_messages m on m.thread_id = t.id and m.sender_role = 'vendor' and m.deleted_at is null
    where i.vendor_id = any(v_ids) and i.created_at >= v_since
    group by i.id, i.vendor_id, i.created_at
  )
  select vp.id, vp.business_name, u.email,
    coalesce((select count(*)::int from public.inquiries where vendor_id = vp.id and created_at >= v_since), 0),
    coalesce((select count(*)::int from public.inquiries where vendor_id = vp.id and created_at >= v_since and status in ('replied','won')), 0),
    coalesce((select count(*)::int from public.inquiries where vendor_id = vp.id and created_at >= v_since and status = 'won'), 0),
    coalesce((select count(*)::int from public.reviews where vendor_id = vp.id and created_at >= v_since), 0),
    (select percentile_cont(0.5) within group (order by extract(epoch from (rt.first_reply_at - rt.inquiry_at)) / 3600.0)
     from reply_times rt where rt.vendor_id = vp.id and rt.first_reply_at is not null)::numeric
  from public.vendor_profiles vp left join auth.users u on u.id = vp.user_id where vp.id = any(v_ids);
end $function$;

-- Retired: scan-reengagement answers 410, stop calling it.
select cron.unschedule('scan-reengagement-daily')
where exists (select 1 from cron.job where jobname = 'scan-reengagement-daily');
