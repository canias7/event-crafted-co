-- Vendor↔vendor DMs are now keyed on profiles.id (the user account)
-- instead of vendor_profiles.id (a specific listing). A vendor account
-- with zero listings can still send + receive partner DMs because the
-- thread no longer needs a listing identity on either side.
--
-- vendor_a_id / vendor_b_id / sender_vendor_id are kept around for now
-- (set NULL on new rows; backward-compat for any read surface that
-- still looks at them — primarily the not-yet-OTA'd mobile apps). They
-- can be dropped later once mobile is on the new schema.

alter table public.vendor_partner_threads
  add column user_a_id uuid references public.profiles(id) on delete cascade,
  add column user_b_id uuid references public.profiles(id) on delete cascade;

alter table public.vendor_partner_threads
  alter column user_a_id set not null,
  alter column user_b_id set not null,
  alter column vendor_a_id drop not null,
  alter column vendor_b_id drop not null;

alter table public.vendor_partner_threads
  drop constraint if exists vendor_partner_threads_vendor_a_id_vendor_b_id_key;

create unique index if not exists vendor_partner_threads_user_pair_key
  on public.vendor_partner_threads (user_a_id, user_b_id);

alter table public.vendor_partner_messages
  add column sender_user_id uuid references public.profiles(id) on delete cascade;

alter table public.vendor_partner_messages
  alter column sender_user_id set not null,
  alter column sender_vendor_id drop not null;

drop policy if exists "vendor_partner_threads participants select" on public.vendor_partner_threads;
drop policy if exists "vendor_partner_threads insert via rpc" on public.vendor_partner_threads;
drop policy if exists "vendor_partner_threads participants update last_message_at" on public.vendor_partner_threads;

create policy "vendor_partner_threads participants select"
  on public.vendor_partner_threads
  for select
  to authenticated
  using (user_a_id = (select auth.uid()) or user_b_id = (select auth.uid()));

create policy "vendor_partner_threads insert via rpc"
  on public.vendor_partner_threads
  for insert
  to authenticated
  with check (user_a_id = (select auth.uid()) or user_b_id = (select auth.uid()));

create policy "vendor_partner_threads participants update"
  on public.vendor_partner_threads
  for update
  to authenticated
  using (user_a_id = (select auth.uid()) or user_b_id = (select auth.uid()))
  with check (user_a_id = (select auth.uid()) or user_b_id = (select auth.uid()));

drop policy if exists "vendor_partner_messages participants select" on public.vendor_partner_messages;
drop policy if exists "vendor_partner_messages send" on public.vendor_partner_messages;

create policy "vendor_partner_messages participants select"
  on public.vendor_partner_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.vendor_partner_threads t
      where t.id = vendor_partner_messages.thread_id
        and (t.user_a_id = (select auth.uid()) or t.user_b_id = (select auth.uid()))
    )
  );

create policy "vendor_partner_messages send"
  on public.vendor_partner_messages
  for insert
  to authenticated
  with check (
    sender_user_id = (select auth.uid())
    and exists (
      select 1 from public.vendor_partner_threads t
      where t.id = vendor_partner_messages.thread_id
        and (t.user_a_id = (select auth.uid()) or t.user_b_id = (select auth.uid()))
    )
  );

drop function if exists public.find_or_create_partner_thread(uuid, uuid);
drop function if exists public.find_or_create_partner_thread(uuid);

create or replace function public.find_or_create_partner_thread(
  p_other_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_a uuid; v_b uuid; v_id uuid;
begin
  if v_me is null then raise exception 'unauthorized'; end if;
  if p_other_user_id is null then raise exception 'missing recipient'; end if;
  if v_me = p_other_user_id then raise exception 'cannot message yourself'; end if;

  if not exists (
    select 1 from public.profiles
    where id = v_me and role = 'vendor' and application_status = 'approved'
  ) then
    raise exception 'caller is not an approved vendor';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_other_user_id and role = 'vendor' and application_status = 'approved'
  ) then
    raise exception 'recipient is not an approved vendor';
  end if;

  if v_me < p_other_user_id then v_a := v_me; v_b := p_other_user_id;
  else v_a := p_other_user_id; v_b := v_me; end if;

  insert into public.vendor_partner_threads (user_a_id, user_b_id, last_message_at)
  values (v_a, v_b, now())
  on conflict (user_a_id, user_b_id)
    do update set last_message_at = vendor_partner_threads.last_message_at
  returning id into v_id;

  return v_id;
end
$$;

grant execute on function public.find_or_create_partner_thread(uuid) to authenticated;
