-- Bring the vendor↔vendor (Partners) chat to schema parity with the
-- vendor↔host inquiry chat. After this migration the partner thread
-- can carry edits, soft-deletes, reply-quotes, attachments, and
-- emoji reactions — all the things 20260519110000 added on the
-- inquiry-side `direct_messages`.
--
-- Also adds per-user archive state on the thread (user_a_archived_at
-- / user_b_archived_at) so vendors can hide a thread without
-- destroying it for the other party.

-- ─── Messages: add edited / deleted / reply / attachments cols ─────
alter table public.vendor_partner_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists reply_to_message_id uuid references public.vendor_partner_messages(id) on delete set null,
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Touch-edited-at trigger — stamp edited_at only when the body or
-- attachments actually change. Soft-delete (deleted_at-only UPDATE)
-- doesn't read as "edited Message deleted".
create or replace function public.tg_partner_messages_touch_edited_at()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if new.body is distinct from old.body
     or new.attachments is distinct from old.attachments then
    new.edited_at := now();
  end if;
  return new;
end
$$;

drop trigger if exists vendor_partner_messages_touch_edited_at
  on public.vendor_partner_messages;
create trigger vendor_partner_messages_touch_edited_at
  before update on public.vendor_partner_messages
  for each row
  execute function public.tg_partner_messages_touch_edited_at();

-- UPDATE policy — sender can edit / soft-delete their own row. SELECT
-- + INSERT policies already exist (verified in pg_policies).
drop policy if exists "vendor_partner_messages sender update"
  on public.vendor_partner_messages;
create policy "vendor_partner_messages sender update"
  on public.vendor_partner_messages
  for update
  using (sender_user_id = (select auth.uid()))
  with check (sender_user_id = (select auth.uid()));

-- ─── Reactions table ───────────────────────────────────────────────
create table if not exists public.vendor_partner_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.vendor_partner_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint vendor_partner_message_reactions_unique
    unique (message_id, user_id, emoji)
);
create index if not exists vendor_partner_message_reactions_message_id_idx
  on public.vendor_partner_message_reactions(message_id);

alter table public.vendor_partner_message_reactions enable row level security;

drop policy if exists "vendor_partner_message_reactions participants select"
  on public.vendor_partner_message_reactions;
create policy "vendor_partner_message_reactions participants select"
  on public.vendor_partner_message_reactions
  for select
  using (
    exists (
      select 1
        from public.vendor_partner_messages m
        join public.vendor_partner_threads t on t.id = m.thread_id
       where m.id = vendor_partner_message_reactions.message_id
         and (t.user_a_id = (select auth.uid())
              or t.user_b_id = (select auth.uid()))
    )
  );

drop policy if exists "vendor_partner_message_reactions self insert"
  on public.vendor_partner_message_reactions;
create policy "vendor_partner_message_reactions self insert"
  on public.vendor_partner_message_reactions
  for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
        from public.vendor_partner_messages m
        join public.vendor_partner_threads t on t.id = m.thread_id
       where m.id = vendor_partner_message_reactions.message_id
         and (t.user_a_id = (select auth.uid())
              or t.user_b_id = (select auth.uid()))
    )
  );

drop policy if exists "vendor_partner_message_reactions self delete"
  on public.vendor_partner_message_reactions;
create policy "vendor_partner_message_reactions self delete"
  on public.vendor_partner_message_reactions
  for delete
  using (user_id = (select auth.uid()));

-- ─── Threads: per-user archive timestamps ─────────────────────────
alter table public.vendor_partner_threads
  add column if not exists user_a_archived_at timestamptz,
  add column if not exists user_b_archived_at timestamptz;

-- ─── Realtime publication ──────────────────────────────────────────
-- Add the messages table (if it's not already published) and the new
-- reactions table so the UI can stream live updates.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vendor_partner_messages'
  ) then
    alter publication supabase_realtime add table public.vendor_partner_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vendor_partner_message_reactions'
  ) then
    alter publication supabase_realtime add table public.vendor_partner_message_reactions;
  end if;
end $$;
