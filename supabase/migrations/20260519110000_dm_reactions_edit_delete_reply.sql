-- Message reactions: a small set of emoji each participant can stick
-- on any message in their thread. UNIQUE (message_id, user_id, emoji)
-- so tapping the same emoji twice toggles instead of duplicating.

create table public.direct_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index direct_message_reactions_message_idx
  on public.direct_message_reactions (message_id);

alter table public.direct_message_reactions enable row level security;

create policy "dm_reactions thread participants select"
  on public.direct_message_reactions for select to authenticated
  using (
    exists (
      select 1
      from public.direct_messages m
      join public.direct_threads t on t.id = m.thread_id
      where m.id = message_id
        and (t.host_id = (select auth.uid()) or public.is_vendor_member(t.vendor_id))
    )
  );

create policy "dm_reactions thread participants insert"
  on public.direct_message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.direct_messages m
      join public.direct_threads t on t.id = m.thread_id
      where m.id = message_id
        and (t.host_id = (select auth.uid()) or public.is_vendor_member(t.vendor_id))
    )
  );

create policy "dm_reactions own delete"
  on public.direct_message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.direct_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists reply_to_message_id uuid
    references public.direct_messages(id) on delete set null;

create or replace function public.tg_direct_messages_touch_edited_at()
returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body
     or new.attachments is distinct from old.attachments then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists direct_messages_touch_edited_at on public.direct_messages;
create trigger direct_messages_touch_edited_at
  before update on public.direct_messages
  for each row execute function public.tg_direct_messages_touch_edited_at();
