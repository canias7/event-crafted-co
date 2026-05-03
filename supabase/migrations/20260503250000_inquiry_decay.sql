-- Inquiry decay: inquiries left untouched by the vendor for N days flip
-- to 'expired' so the host's pipeline reflects reality and the vendor's
-- inbox doesn't drown in stale "new" rows. Triggered by a cron-scheduled
-- edge function (scan-expired-inquiries) that calls this RPC daily.
--
-- An inquiry expires when:
--   - status is 'new' or 'drafted' (vendor never replied, or AI drafted
--     a reply but vendor didn't approve it)
--   - created_at < now() - N days
--   - no vendor message exists on it
--   - event_date is in the past (or null AND created N+30 days ago, so
--     date-less inquiries expire conservatively)
--
-- Default window: 14 days post-create. Tunable via the function arg.

create or replace function public.expire_stale_inquiries(
  p_after_days int default 14
)
returns table (
  inquiry_id uuid,
  host_id uuid,
  vendor_id uuid,
  vendor_name text,
  host_email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  -- Find every inquiry that should expire now. Mark them in the same
  -- statement to make the scan idempotent.
  with eligible as (
    update public.inquiries i
    set status = 'expired'
    where i.status in ('new', 'drafted')
      and i.created_at < (now() - make_interval(days => p_after_days))
      and not exists (
        select 1 from public.messages m
        where m.inquiry_id = i.id and m.sender_role = 'vendor'
      )
      -- Don't expire future-dated inquiries — host might still want to
      -- chase the vendor for a reply.
      and (
        i.event_date is null
        and i.created_at < (now() - make_interval(days => p_after_days + 30))
        or i.event_date < current_date
        or i.event_date is null
      )
    returning i.id
  )
  select array_agg(id) into v_ids from eligible;

  if v_ids is null or array_length(v_ids, 1) = 0 then
    return;
  end if;

  -- In-app notification to the host so the status change isn't silent.
  insert into public.notifications (user_id, type, title, body, link)
  select
    i.host_id,
    'inquiry_expired',
    'Your ' || replace(i.event_type, '_', ' ') || ' inquiry expired',
    coalesce(vp.business_name, 'The vendor') ||
      ' didn''t reply within ' || p_after_days ||
      ' days. You can re-inquire or browse other vendors.',
    '/customer/inquiries/' || i.id::text
  from public.inquiries i
  left join public.vendor_profiles vp on vp.id = i.vendor_id
  where i.id = any(v_ids);

  return query
  select
    i.id,
    i.host_id,
    i.vendor_id,
    coalesce(vp.business_name, 'a vendor'),
    u.email
  from public.inquiries i
  left join public.vendor_profiles vp on vp.id = i.vendor_id
  left join auth.users u on u.id = i.host_id
  where i.id = any(v_ids);
end$$;

grant execute on function public.expire_stale_inquiries(int) to service_role;
