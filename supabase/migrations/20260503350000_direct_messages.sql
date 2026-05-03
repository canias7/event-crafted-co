-- Direct vendor DMs: lower-friction conversation between a host and a
-- vendor without first sending a structured inquiry. Once they're
-- ready to formalize, the vendor (or the host) can convert the thread
-- to a real inquiry — wired separately at the UI layer.
--
-- Two tables: one thread per host-vendor pair (unique), and a messages
-- table scoped to threads. Mirrors the inquiry/messages shape so the
-- frontend can reuse most of the patterns.

create table public.direct_threads (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  -- Link to a formalized inquiry once the conversation matures. Set by
  -- the convert-to-inquiry flow. Null = still casual.
  inquiry_id uuid references public.inquiries(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (host_id, vendor_id)
);

create index direct_threads_host_idx
  on public.direct_threads (host_id, last_message_at desc);

create index direct_threads_vendor_idx
  on public.direct_threads (vendor_id, last_message_at desc);

alter table public.direct_threads enable row level security;

create policy "direct_threads participants select"
  on public.direct_threads for select to authenticated
  using (
    auth.uid() = host_id
    or public.is_vendor_member(vendor_id)
  );

create policy "direct_threads host insert"
  on public.direct_threads for insert to authenticated
  with check (auth.uid() = host_id);

create policy "direct_threads update participants"
  on public.direct_threads for update to authenticated
  using (
    auth.uid() = host_id
    or public.is_vendor_member(vendor_id)
  );

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.direct_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('host','vendor')),
  body text not null check (length(trim(body)) > 0),
  -- Soft signal: client-side regex flagged contact info in this message.
  -- We don't block — just track for analytics. See the honest-take
  -- conversation in commit history for why this isn't enforcement.
  contact_info_flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create index direct_messages_thread_created_idx
  on public.direct_messages (thread_id, created_at);

alter table public.direct_messages enable row level security;

create policy "direct_messages participants select"
  on public.direct_messages for select to authenticated
  using (
    exists (
      select 1 from public.direct_threads t
      where t.id = thread_id
        and (auth.uid() = t.host_id or public.is_vendor_member(t.vendor_id))
    )
  );

create policy "direct_messages participants insert"
  on public.direct_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.direct_threads t
      where t.id = thread_id
        and (
          (sender_role = 'host' and auth.uid() = t.host_id)
          or (sender_role = 'vendor' and public.is_vendor_member(t.vendor_id))
        )
    )
  );

-- Bump thread.last_message_at on every message insert so the inbox
-- list orders by most-recent activity.
create or replace function public.tg_bump_direct_thread_last_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.direct_threads
  set last_message_at = new.created_at
  where id = new.thread_id;
  return new;
end$$;

create trigger direct_messages_bump_thread
  after insert on public.direct_messages
  for each row execute function public.tg_bump_direct_thread_last_message();

-- Notify the recipient when a new direct message arrives.
create or replace function public.notify_direct_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_thread public.direct_threads;
  v_sender_name text;
  v_vendor_name text;
begin
  select * into v_thread from public.direct_threads where id = new.thread_id;
  if v_thread.id is null then return new; end if;

  if new.sender_role = 'host' then
    -- Notify the vendor team
    select coalesce(p.display_name, 'A host') into v_sender_name
    from public.profiles p where p.id = new.sender_id;
    insert into public.notifications (user_id, type, title, body, link)
    select
      m.user_id,
      'direct_message',
      v_sender_name || ' sent you a message',
      left(new.body, 140),
      '/vendor/messages?thread=' || v_thread.id::text
    from public.vendor_team_members m
    where m.vendor_id = v_thread.vendor_id;
  else
    -- Notify the host
    select business_name into v_vendor_name
    from public.vendor_profiles where id = v_thread.vendor_id;
    insert into public.notifications (user_id, type, title, body, link)
    values (
      v_thread.host_id,
      'direct_message',
      coalesce(v_vendor_name, 'A vendor') || ' sent you a message',
      left(new.body, 140),
      '/customer/messages?thread=' || v_thread.id::text
    );
  end if;

  return new;
end$$;

create trigger direct_messages_notify
  after insert on public.direct_messages
  for each row execute function public.notify_direct_message();

-- SECURITY DEFINER find-or-create so the host can open a thread to any
-- vendor without first checking if a row exists. Runs as the host
-- (auth.uid()) so the policy still gates ownership.
create or replace function public.find_or_create_direct_thread(p_vendor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_thread_id
  from public.direct_threads
  where host_id = auth.uid() and vendor_id = p_vendor_id;

  if v_thread_id is null then
    insert into public.direct_threads (host_id, vendor_id)
    values (auth.uid(), p_vendor_id)
    returning id into v_thread_id;
  end if;

  return v_thread_id;
end$$;

grant execute on function public.find_or_create_direct_thread(uuid) to authenticated;
