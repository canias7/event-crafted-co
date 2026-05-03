-- Auto review prompts: N days after a won inquiry's event_date passes,
-- nudge the host to leave a review for the vendor. Drops an in-app
-- notification and returns the rows so an edge function can send emails.
--
-- Triggered by a cron-scheduled edge function (scan-review-prompts) that
-- calls enqueue_pending_review_prompts() once a day.

alter table public.inquiries
  add column if not exists review_prompt_sent_at timestamptz;

create index if not exists inquiries_review_prompt_idx
  on public.inquiries (status, event_date)
  where status = 'won' and review_prompt_sent_at is null;

create or replace function public.enqueue_pending_review_prompts(
  p_after_days int default 3
)
returns table (
  inquiry_id uuid,
  host_id uuid,
  vendor_id uuid,
  vendor_name text,
  event_type text,
  event_date date,
  host_email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  -- Pick up everyone eligible right now. Marking them in the same
  -- statement avoids race conditions if two scans overlap.
  with eligible as (
    update public.inquiries i
    set review_prompt_sent_at = now()
    where i.status = 'won'
      and i.event_date is not null
      and i.event_date <= (current_date - make_interval(days => p_after_days))
      and i.review_prompt_sent_at is null
      and not exists (
        select 1 from public.reviews r
        where r.inquiry_id = i.id and r.host_id = i.host_id
      )
    returning i.id
  )
  select array_agg(id) into v_ids from eligible;

  if v_ids is null or array_length(v_ids, 1) = 0 then
    return;
  end if;

  -- In-app notification for each.
  insert into public.notifications (user_id, type, title, body, link)
  select
    i.host_id,
    'review_prompt',
    coalesce(vp.business_name, 'Your vendor') || ' — leave a review?',
    'How was your '
      || replace(i.event_type, '_', ' ')
      || '? Your review helps other hosts choose with confidence.',
    '/customer/inquiries/' || i.id::text
  from public.inquiries i
  left join public.vendor_profiles vp on vp.id = i.vendor_id
  where i.id = any(v_ids);

  -- Return rows so the edge function caller can send emails.
  return query
  select
    i.id,
    i.host_id,
    i.vendor_id,
    coalesce(vp.business_name, 'your vendor'),
    i.event_type,
    i.event_date,
    u.email
  from public.inquiries i
  left join public.vendor_profiles vp on vp.id = i.vendor_id
  left join auth.users u on u.id = i.host_id
  where i.id = any(v_ids);
end$$;

grant execute on function public.enqueue_pending_review_prompts(int)
  to service_role;
