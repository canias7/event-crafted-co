-- Vendor weekly digest: opt-in summary of the past week's activity
-- (new inquiries, replies, bookings, revenue, response time, reviews).
-- Separate channel from the host-side daily digest so vendors who want
-- less noise can still get a weekly Monday-morning roll-up.
--
-- Toggle lives on vendor_profiles. Defaults to true since vendors who
-- never log in benefit most from the email.

alter table public.vendor_profiles
  add column if not exists weekly_digest_enabled boolean not null default true,
  add column if not exists weekly_digest_sent_at timestamptz;

-- Pulls the digest payload for every vendor who:
--   - has weekly_digest_enabled = true
--   - hasn't been sent a digest in the last 6 days (cooldown so a re-run
--     within the same week doesn't double-send)
--   - has at least one event-worthy activity row in the window (inquiry,
--     proposal, review, won) — quiet weeks skip the email
create or replace function public.enqueue_vendor_weekly_digests(
  p_window_days int default 7
)
returns table (
  vendor_id uuid,
  vendor_name text,
  recipient_email text,
  inquiries_new int,
  inquiries_replied int,
  bookings_new int,
  reviews_new int,
  median_response_hours numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_since timestamptz := now() - make_interval(days => p_window_days);
begin
  with eligible as (
    update public.vendor_profiles vp
    set weekly_digest_sent_at = now()
    where vp.weekly_digest_enabled = true
      and (
        vp.weekly_digest_sent_at is null
        or vp.weekly_digest_sent_at < (now() - interval '6 days')
      )
      and (
        exists (
          select 1 from public.inquiries
          where vendor_id = vp.id and created_at >= v_since
        )
        or exists (
          select 1 from public.proposals
          where vendor_id = vp.id and created_at >= v_since
        )
        or exists (
          select 1 from public.reviews
          where vendor_id = vp.id and created_at >= v_since
        )
      )
    returning vp.id
  )
  select array_agg(id) into v_ids from eligible;

  if v_ids is null or array_length(v_ids, 1) = 0 then
    return;
  end if;

  return query
  with reply_times as (
    select
      i.vendor_id,
      i.id as inquiry_id,
      i.created_at as inquiry_at,
      min(m.created_at) as first_reply_at
    from public.inquiries i
    left join public.messages m
      on m.inquiry_id = i.id and m.sender_role = 'vendor'
    where i.vendor_id = any(v_ids)
      and i.created_at >= v_since
    group by i.id, i.vendor_id, i.created_at
  )
  select
    vp.id as vendor_id,
    vp.business_name as vendor_name,
    -- The owner's auth email — for v1, only the original creator gets
    -- the weekly digest. Team members can subscribe later via a per-
    -- member preference.
    u.email as recipient_email,
    coalesce((
      select count(*)::int
      from public.inquiries
      where vendor_id = vp.id and created_at >= v_since
    ), 0) as inquiries_new,
    coalesce((
      select count(*)::int
      from public.inquiries
      where vendor_id = vp.id
        and created_at >= v_since
        and status in ('replied', 'won')
    ), 0) as inquiries_replied,
    coalesce((
      select count(*)::int
      from public.inquiries
      where vendor_id = vp.id
        and created_at >= v_since
        and status = 'won'
    ), 0) as bookings_new,
    coalesce((
      select count(*)::int
      from public.reviews
      where vendor_id = vp.id and created_at >= v_since
    ), 0) as reviews_new,
    (
      select percentile_cont(0.5) within group (
        order by extract(epoch from (rt.first_reply_at - rt.inquiry_at)) / 3600.0
      )
      from reply_times rt
      where rt.vendor_id = vp.id and rt.first_reply_at is not null
    ) as median_response_hours
  from public.vendor_profiles vp
  left join auth.users u on u.id = vp.user_id
  where vp.id = any(v_ids);
end$$;

grant execute on function public.enqueue_vendor_weekly_digests(int)
  to service_role;
