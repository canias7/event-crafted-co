-- Real mute + report flows for direct-message threads. Replace the
-- "coming soon" alerts in both mobile apps with real persistence.
--
-- thread_mutes: per-user opt-out from notifications on a thread.
--   Recipients can mute either side of a direct_threads row. The
--   notify_direct_message trigger is updated below to skip muted
--   recipients.
--
-- thread_reports: append-only report log for admin review. The
--   apps insert a row when the user picks Report; admin tooling can
--   read these (via is_admin()).

create table if not exists public.thread_mutes (
  user_id   uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.direct_threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);

create index if not exists thread_mutes_thread_idx
  on public.thread_mutes (thread_id);

alter table public.thread_mutes enable row level security;

drop policy if exists "thread_mutes self read"   on public.thread_mutes;
drop policy if exists "thread_mutes self insert" on public.thread_mutes;
drop policy if exists "thread_mutes self delete" on public.thread_mutes;

create policy "thread_mutes self read"
  on public.thread_mutes for select to authenticated
  using (auth.uid() = user_id);

create policy "thread_mutes self insert"
  on public.thread_mutes for insert to authenticated
  with check (auth.uid() = user_id);

create policy "thread_mutes self delete"
  on public.thread_mutes for delete to authenticated
  using (auth.uid() = user_id);

create table if not exists public.thread_reports (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid references public.direct_threads(id) on delete set null,
  reporter_id uuid references auth.users(id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists thread_reports_thread_idx
  on public.thread_reports (thread_id);
create index if not exists thread_reports_reporter_idx
  on public.thread_reports (reporter_id);

alter table public.thread_reports enable row level security;

drop policy if exists "thread_reports self insert" on public.thread_reports;
drop policy if exists "thread_reports admin read"  on public.thread_reports;

create policy "thread_reports self insert"
  on public.thread_reports for insert to authenticated
  with check (auth.uid() = reporter_id);

create policy "thread_reports admin read"
  on public.thread_reports for select to authenticated
  using (public.is_admin());

-- Update notify_direct_message to suppress notification inserts for
-- users who muted the thread. Otherwise behavior identical to the
-- previous version (host-to-vendor fans out to vendor_team_members;
-- vendor-to-host hits the single host).
create or replace function public.notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_thread public.direct_threads;
  v_sender_name text;
  v_vendor_name text;
begin
  select * into v_thread from public.direct_threads where id = new.thread_id;
  if v_thread.id is null then return new; end if;

  if new.sender_role = 'host' then
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
    where m.vendor_id = v_thread.vendor_id
      and not exists (
        select 1 from public.thread_mutes mut
        where mut.user_id = m.user_id and mut.thread_id = v_thread.id
      );
  else
    select business_name into v_vendor_name
      from public.vendor_profiles where id = v_thread.vendor_id;
    if not exists (
      select 1 from public.thread_mutes mut
      where mut.user_id = v_thread.host_id and mut.thread_id = v_thread.id
    ) then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        v_thread.host_id,
        'direct_message',
        coalesce(v_vendor_name, 'A vendor') || ' sent you a message',
        left(new.body, 140),
        '/customer/messages?thread=' || v_thread.id::text
      );
    end if;
  end if;
  return new;
end$function$;
