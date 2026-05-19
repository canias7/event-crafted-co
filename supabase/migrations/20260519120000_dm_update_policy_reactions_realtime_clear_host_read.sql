-- Three messaging fixes audit-flagged after the chat redesign:
--
-- 1. direct_messages had SELECT + INSERT policies only, so the edit
--    and soft-delete UI paths silently no-op'd — RLS denied the
--    UPDATE without raising, the optimistic UI flashed the change,
--    then realtime reverted it. Add an UPDATE policy scoped to the
--    sender so people can edit / soft-delete their own messages.
--
-- 2. direct_message_reactions was created but never added to the
--    supabase_realtime publication, so reaction inserts / deletes
--    did not stream to the other party. Add it.
--
-- 3. There's an existing trigger that clears inquiries.vendor_read_at
--    when a host sends a new message (so the vendor's inbox-dot
--    re-lights). The mirror for inquiries.host_read_at was missing,
--    so the vendor's "Seen · 3:42pm" indicator kept showing forever
--    based on the host's first-open timestamp, even after the
--    vendor sent more messages the host hadn't seen yet. Add it.

-- ─── 1. UPDATE policy on direct_messages ────────────────────────────
-- Sender can update their own row. We intentionally don't list a
-- column allowlist here — the only fields the UI ever writes are
-- body / edited_at / deleted_at, and the touch_edited_at trigger
-- already maintains edited_at on body changes. If we ever need to
-- lock down which columns are updatable, do it in a separate
-- BEFORE-UPDATE guard.
create policy "direct_messages sender update"
  on public.direct_messages
  for update
  using (sender_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()));

-- ─── 2. Realtime publication for reactions ─────────────────────────
alter publication supabase_realtime add table public.direct_message_reactions;

-- ─── 3. Mirror trigger: clear host_read_at on vendor/agent send ────
create or replace function public.tg_clear_host_read_on_vendor_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inquiry_id uuid;
begin
  -- Fire for vendor + agent (AI replies sent on the vendor's behalf
  -- count as outbound for the vendor side). Host's own messages
  -- shouldn't clear the host's own read pointer.
  if new.sender_role not in ('vendor', 'agent') then
    return new;
  end if;
  select inquiry_id into v_inquiry_id
    from public.direct_threads
   where id = new.thread_id;
  if v_inquiry_id is null then
    return new;
  end if;
  update public.inquiries
     set host_read_at = null
   where id = v_inquiry_id
     and host_read_at is not null;
  return new;
end
$$;

drop trigger if exists direct_messages_clear_host_read on public.direct_messages;
create trigger direct_messages_clear_host_read
  after insert on public.direct_messages
  for each row
  execute function public.tg_clear_host_read_on_vendor_message();
