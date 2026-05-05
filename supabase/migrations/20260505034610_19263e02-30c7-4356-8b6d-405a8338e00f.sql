create table public.vendor_partner_threads (
  id uuid primary key default gen_random_uuid(),
  vendor_a_id uuid not null,
  vendor_b_id uuid not null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (vendor_a_id < vendor_b_id),
  unique (vendor_a_id, vendor_b_id)
);
create index vendor_partner_threads_a_idx on public.vendor_partner_threads (vendor_a_id, last_message_at desc);
create index vendor_partner_threads_b_idx on public.vendor_partner_threads (vendor_b_id, last_message_at desc);
alter table public.vendor_partner_threads enable row level security;
create policy "vendor_partner_threads participants select" on public.vendor_partner_threads for select to authenticated
  using (public.is_vendor_member(vendor_a_id) or public.is_vendor_member(vendor_b_id));
create policy "vendor_partner_threads insert via rpc" on public.vendor_partner_threads for insert to authenticated
  with check (public.is_vendor_member(vendor_a_id) or public.is_vendor_member(vendor_b_id));
create policy "vendor_partner_threads participants update" on public.vendor_partner_threads for update to authenticated
  using (public.is_vendor_member(vendor_a_id) or public.is_vendor_member(vendor_b_id));

create table public.vendor_partner_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.vendor_partner_threads(id) on delete cascade,
  sender_vendor_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index vendor_partner_messages_thread_idx on public.vendor_partner_messages (thread_id, created_at);
alter table public.vendor_partner_messages enable row level security;
create policy "vendor_partner_messages participants select" on public.vendor_partner_messages for select to authenticated
  using (exists (select 1 from public.vendor_partner_threads t where t.id = thread_id
    and (public.is_vendor_member(t.vendor_a_id) or public.is_vendor_member(t.vendor_b_id))));
create policy "vendor_partner_messages send" on public.vendor_partner_messages for insert to authenticated
  with check (public.is_vendor_member(sender_vendor_id) and exists (
    select 1 from public.vendor_partner_threads t where t.id = thread_id
      and (t.vendor_a_id = sender_vendor_id or t.vendor_b_id = sender_vendor_id)));

create or replace function public.find_or_create_partner_thread(p_other_vendor_id uuid, p_my_vendor_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_my_vendor uuid; v_a uuid; v_b uuid; v_id uuid;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if p_my_vendor_id is not null then
    if not public.is_vendor_member(p_my_vendor_id) then raise exception 'not a member'; end if;
    v_my_vendor := p_my_vendor_id;
  else
    select vp.id into v_my_vendor from public.vendor_profiles vp where vp.user_id = v_user limit 1;
    if v_my_vendor is null then
      select tm.vendor_id into v_my_vendor from public.vendor_team_members tm where tm.user_id = v_user limit 1;
    end if;
    if v_my_vendor is null then raise exception 'no vendor profile'; end if;
  end if;
  if v_my_vendor = p_other_vendor_id then raise exception 'cannot message yourself'; end if;
  if v_my_vendor < p_other_vendor_id then v_a := v_my_vendor; v_b := p_other_vendor_id;
  else v_a := p_other_vendor_id; v_b := v_my_vendor; end if;
  insert into public.vendor_partner_threads (vendor_a_id, vendor_b_id) values (v_a, v_b)
    on conflict (vendor_a_id, vendor_b_id) do update set last_message_at = vendor_partner_threads.last_message_at
    returning id into v_id;
  return v_id;
end$$;
grant execute on function public.find_or_create_partner_thread(uuid, uuid) to authenticated;

create or replace function public.tg_bump_partner_thread_last_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin update public.vendor_partner_threads set last_message_at = new.created_at where id = new.thread_id;
  return new; end$$;
drop trigger if exists vendor_partner_messages_bump_thread on public.vendor_partner_messages;
create trigger vendor_partner_messages_bump_thread after insert on public.vendor_partner_messages
  for each row execute function public.tg_bump_partner_thread_last_message();

create or replace function public.notify_partner_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_thread record; v_recipient_vendor uuid; v_sender_name text; r record;
begin
  select * into v_thread from public.vendor_partner_threads where id = new.thread_id;
  if v_thread.id is null then return new; end if;
  v_recipient_vendor := case when new.sender_vendor_id = v_thread.vendor_a_id then v_thread.vendor_b_id else v_thread.vendor_a_id end;
  select coalesce(business_name, 'Another vendor') into v_sender_name from public.vendor_profiles where id = new.sender_vendor_id;
  for r in
    select user_id from public.vendor_profiles where id = v_recipient_vendor
    union
    select user_id from public.vendor_team_members where vendor_id = v_recipient_vendor
  loop
    if r.user_id is not null then
      insert into public.notifications (user_id, type, title, body, link)
      values (r.user_id, 'vendor_partner_message', v_sender_name || ' sent you a message',
        substring(new.body for 140), '/vendor/messages?thread=' || new.thread_id::text);
    end if;
  end loop;
  return new;
end$$;
drop trigger if exists vendor_partner_messages_notify on public.vendor_partner_messages;
create trigger vendor_partner_messages_notify after insert on public.vendor_partner_messages
  for each row execute function public.notify_partner_message();
revoke execute on function public.tg_bump_partner_thread_last_message() from public, anon, authenticated;
revoke execute on function public.notify_partner_message() from public, anon, authenticated;