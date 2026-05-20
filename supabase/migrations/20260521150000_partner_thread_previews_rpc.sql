-- Server-side last-message-per-thread lookup for the partners inbox.
-- The page used to fetch EVERY message across EVERY thread and dedupe
-- client-side to compute the preview snippet. That's a quadratic
-- read pattern: threads × messages-per-thread bytes shipped each load.
--
-- DISTINCT ON walks the (thread_id, created_at) index once per
-- thread and returns just the newest row — bounded at len(thread_ids)
-- rows regardless of history depth.

create or replace function public.get_partner_thread_previews(p_thread_ids uuid[])
returns table (
  thread_id uuid,
  body text,
  sender_user_id uuid,
  deleted_at timestamptz
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select distinct on (m.thread_id)
    m.thread_id,
    m.body,
    m.sender_user_id,
    m.deleted_at
  from public.vendor_partner_messages m
  where m.thread_id = any(p_thread_ids)
  order by m.thread_id, m.created_at desc;
$$;

grant execute on function public.get_partner_thread_previews(uuid[]) to authenticated;
