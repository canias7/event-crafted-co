create table public.event_party_invites (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null,
  event_id uuid not null references public.host_events(id) on delete cascade,
  email text not null,
  role_label text not null default 'VIP',
  token text unique not null default replace(gen_random_uuid()::text, '-', ''),
  member_user_id uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);
create index event_party_invites_member_idx on public.event_party_invites (member_user_id) where member_user_id is not null;
create index event_party_invites_host_idx on public.event_party_invites (host_id, event_id, created_at desc);
create index event_party_invites_token_idx on public.event_party_invites (token);
alter table public.event_party_invites enable row level security;
create policy "event_party_invites host all" on public.event_party_invites for all to authenticated
  using (auth.uid() = host_id) with check (auth.uid() = host_id);
create policy "event_party_invites member select" on public.event_party_invites for select to authenticated
  using (auth.uid() = member_user_id);

create table public.event_party_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.host_events(id) on delete cascade,
  invite_id uuid not null references public.event_party_invites(id) on delete cascade,
  title text not null,
  notes text,
  due_date date,
  completed_at timestamptz,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_party_tasks_invite_idx on public.event_party_tasks (invite_id, display_order, due_date);
alter table public.event_party_tasks enable row level security;
create policy "event_party_tasks host all" on public.event_party_tasks for all to authenticated
  using (exists (select 1 from public.host_events e where e.id = event_id and e.host_id = auth.uid()))
  with check (exists (select 1 from public.host_events e where e.id = event_id and e.host_id = auth.uid()));
create policy "event_party_tasks member select" on public.event_party_tasks for select to authenticated
  using (exists (select 1 from public.event_party_invites i where i.id = invite_id and i.member_user_id = auth.uid()));
create policy "event_party_tasks member mark complete" on public.event_party_tasks for update to authenticated
  using (exists (select 1 from public.event_party_invites i where i.id = invite_id and i.member_user_id = auth.uid()))
  with check (exists (select 1 from public.event_party_invites i where i.id = invite_id and i.member_user_id = auth.uid()));

create or replace function public.get_party_invite_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $func$
declare v_invite public.event_party_invites; v_event record; v_host_name text;
begin
  select * into v_invite from public.event_party_invites where token = p_token;
  if v_invite.id is null then return jsonb_build_object('ok', false, 'error', 'invite_not_found'); end if;
  select * into v_event from public.host_events where id = v_invite.event_id;
  select coalesce(display_name, 'A Vendora host') into v_host_name from public.profiles where id = v_invite.host_id;
  return jsonb_build_object('ok', true, 'email', v_invite.email, 'role_label', v_invite.role_label,
    'accepted', v_invite.accepted_at is not null,
    'event', jsonb_build_object('id', v_event.id, 'name', v_event.name, 'event_type', v_event.event_type,
      'event_date', v_event.event_date, 'event_location', v_event.event_location, 'host_name', v_host_name));
end$func$;
revoke execute on function public.get_party_invite_by_token(text) from public;
grant execute on function public.get_party_invite_by_token(text) to anon, authenticated;

create or replace function public.accept_party_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $func$
declare v_invite public.event_party_invites; v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  select * into v_invite from public.event_party_invites where token = p_token;
  if v_invite.id is null then return jsonb_build_object('ok', false, 'error', 'invite_not_found'); end if;
  update public.event_party_invites set member_user_id = v_user_id, accepted_at = coalesce(accepted_at, now())
    where id = v_invite.id;
  return jsonb_build_object('ok', true, 'event_id', v_invite.event_id);
end$func$;
grant execute on function public.accept_party_invite(text) to authenticated;

create or replace function public.get_party_portal(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $func$
declare v_user uuid := auth.uid(); v_invite record; v_event record; v_host_name text;
  v_schedule jsonb; v_vendors jsonb; v_registry jsonb; v_gifts jsonb; v_my_tasks jsonb;
begin
  if v_user is null then return null; end if;
  select * into v_invite from public.event_party_invites
    where event_id = p_event_id and member_user_id = v_user and accepted_at is not null;
  if v_invite.id is null then return null; end if;
  select * into v_event from public.host_events where id = p_event_id;
  if v_event.id is null then return null; end if;
  select coalesce(display_name, 'A Vendora host') into v_host_name from public.profiles where id = v_event.host_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'notes', t.notes,
    'start_time', t.start_time, 'duration_minutes', t.duration_minutes, 'location', t.location)
    order by t.start_time, t.display_order), '[]'::jsonb)
    into v_schedule from public.event_timeline_items t where t.event_id = p_event_id;
  select coalesce(jsonb_agg(distinct jsonb_build_object('vendor_id', vp.id, 'business_name', vp.business_name,
    'category', vp.category, 'location', vp.location)), '[]'::jsonb)
    into v_vendors from public.inquiries i join public.vendor_profiles vp on vp.id = i.vendor_id
    where i.host_id = v_event.host_id and i.status = 'won';
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'label', r.label, 'provider', r.provider,
    'url', r.url, 'description', r.description) order by r.display_order, r.created_at), '[]'::jsonb)
    into v_registry from public.event_registry_links r where r.host_id = v_event.host_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'title', w.title, 'description', w.description,
    'image_url', w.image_url, 'target_cents', w.target_cents, 'share_token', w.share_token) order by w.created_at desc), '[]'::jsonb)
    into v_gifts from public.gift_wishes w where w.host_id = v_event.host_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', tk.id, 'title', tk.title, 'notes', tk.notes,
    'due_date', tk.due_date, 'completed_at', tk.completed_at) order by tk.display_order, tk.due_date), '[]'::jsonb)
    into v_my_tasks from public.event_party_tasks tk where tk.invite_id = v_invite.id;
  return jsonb_build_object('role_label', v_invite.role_label,
    'event', jsonb_build_object('id', v_event.id, 'name', v_event.name, 'event_type', v_event.event_type,
      'event_date', v_event.event_date, 'event_location', v_event.event_location, 'host_name', v_host_name),
    'schedule', v_schedule, 'vendors', v_vendors, 'registry', v_registry, 'gifts', v_gifts, 'my_tasks', v_my_tasks);
end$func$;
revoke execute on function public.get_party_portal(uuid) from public, anon;
grant execute on function public.get_party_portal(uuid) to authenticated;

create or replace function public.list_my_party_events()
returns table (invite_id uuid, event_id uuid, event_name text, event_type text, event_date date,
  event_location text, role_label text, host_name text)
language sql stable security definer set search_path = public as $func$
  select i.id, e.id, e.name, e.event_type, e.event_date, e.event_location, i.role_label,
    coalesce(p.display_name, 'A Vendora host')
  from public.event_party_invites i
  join public.host_events e on e.id = i.event_id
  left join public.profiles p on p.id = i.host_id
  where i.member_user_id = auth.uid() and i.accepted_at is not null
  order by e.event_date nulls last, e.created_at desc;
$func$;
revoke execute on function public.list_my_party_events() from public, anon;
grant execute on function public.list_my_party_events() to authenticated;

create or replace function public.notify_host_party_accepted()
returns trigger language plpgsql security definer set search_path = public as $func$
declare v_member_name text;
begin
  if new.accepted_at is null or old.accepted_at is not null then return new; end if;
  select coalesce(display_name, new.email) into v_member_name from public.profiles where id = new.member_user_id;
  insert into public.notifications (user_id, type, title, body, link)
  values (new.host_id, 'party_invite_accepted', v_member_name || ' joined your inner circle',
    'They can now see the schedule, vendors, and any tasks you assign.', '/customer/planning-team');
  return new;
end$func$;
drop trigger if exists party_invite_accepted on public.event_party_invites;
create trigger party_invite_accepted after update of accepted_at on public.event_party_invites
  for each row execute function public.notify_host_party_accepted();
revoke execute on function public.notify_host_party_accepted() from public, anon, authenticated;