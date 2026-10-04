-- Bubble active inquiries to the top of the inbox. Previously the inbox
-- ordered by inquiries.created_at, so a 6-month-old inquiry receiving
-- a brand new message stayed buried below freshly-created (but quiet)
-- ones. Adding a denormalized last_message_at + trigger so the inbox
-- can order by activity, and so the unread predicate becomes
-- "last_message_at > vendor_read_at" instead of the brittle
-- "vendor_read_at IS NULL" (which permanently flips off on first open).
--
-- Backfill from direct_threads.last_message_at where the thread is
-- linked to an inquiry, otherwise leave at created_at.

alter table public.inquiries
  add column if not exists last_message_at timestamptz not null default now();

-- Backfill: take the linked thread's last_message_at when available,
-- otherwise keep the inquiry's created_at. Idempotent thanks to the
-- coalesce + the conditional inquiry_id is not null check.
update public.inquiries i
  set last_message_at = coalesce(t.last_message_at, i.created_at)
  from public.direct_threads t
  where t.inquiry_id = i.id;

-- For inquiries that never converted to a thread, anchor to created_at.
update public.inquiries
  set last_message_at = created_at
  where last_message_at is null;

create index if not exists inquiries_last_message_at_idx
  on public.inquiries (last_message_at desc);

-- Trigger: on every direct_messages INSERT, bump the linked inquiry's
-- last_message_at. The link is direct_threads.inquiry_id (set when
-- the thread is converted from a casual DM to a formal inquiry).
-- No-op for threads that aren't yet linked to an inquiry.
create or replace function public.tg_bump_inquiry_last_message_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inquiry_id uuid;
begin
  select inquiry_id into v_inquiry_id
    from public.direct_threads
    where id = new.thread_id;
  if v_inquiry_id is not null then
    update public.inquiries
      set last_message_at = new.created_at
      where id = v_inquiry_id
        and last_message_at < new.created_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_bump_inquiry_last_message_at()
  from public, anon, authenticated;

drop trigger if exists bump_inquiry_last_message_at on public.direct_messages;
create trigger bump_inquiry_last_message_at
  after insert on public.direct_messages
  for each row
  execute function public.tg_bump_inquiry_last_message_at();
