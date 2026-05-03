-- Appointments
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid references public.inquiries(id) on delete set null,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'consultation' check (kind in ('consultation','walkthrough','tasting','fitting','phone_call','other')),
  title text, location text,
  scheduled_at timestamptz not null,
  duration_minutes int not null default 60,
  status text not null default 'proposed' check (status in ('proposed','accepted','declined','cancelled','completed')),
  proposed_by text not null check (proposed_by in ('host','vendor')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appointments_host_idx on public.appointments (host_id, scheduled_at desc);
create index appointments_vendor_idx on public.appointments (vendor_id, scheduled_at desc);
create index appointments_status_idx on public.appointments (status);
alter table public.appointments enable row level security;
create policy "appointments select participants" on public.appointments for select to authenticated using (auth.uid() = host_id or public.is_vendor_member(vendor_id));
create policy "appointments host insert" on public.appointments for insert to authenticated with check (auth.uid() = host_id and proposed_by = 'host');
create policy "appointments vendor insert" on public.appointments for insert to authenticated with check (public.is_vendor_member(vendor_id) and proposed_by = 'vendor');
create policy "appointments host update" on public.appointments for update to authenticated using (auth.uid() = host_id) with check (auth.uid() = host_id);
create policy "appointments vendor update" on public.appointments for update to authenticated using (public.is_vendor_member(vendor_id)) with check (public.is_vendor_member(vendor_id));
create trigger appointments_updated before update on public.appointments for each row execute function public.tg_set_updated_at();

-- Vendor packages
create table public.vendor_packages (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  name text not null, description text,
  price_cents integer not null check (price_cents >= 0),
  includes jsonb not null default '[]'::jsonb,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vendor_packages_vendor_idx on public.vendor_packages (vendor_id, display_order, created_at);
create index vendor_packages_active_idx on public.vendor_packages (vendor_id, is_active, price_cents) where is_active = true;
alter table public.vendor_packages enable row level security;
create policy "vendor_packages public read active" on public.vendor_packages for select using (is_active = true);
create policy "vendor_packages member read all" on public.vendor_packages for select to authenticated using (public.is_vendor_member(vendor_id));
create policy "vendor_packages member insert" on public.vendor_packages for insert to authenticated with check (public.is_vendor_member(vendor_id));
create policy "vendor_packages member update" on public.vendor_packages for update to authenticated using (public.is_vendor_member(vendor_id));
create policy "vendor_packages member delete" on public.vendor_packages for delete to authenticated using (public.is_vendor_member(vendor_id));
create trigger vendor_packages_updated before update on public.vendor_packages for each row execute function public.tg_set_updated_at();

-- Review prompts
alter table public.inquiries add column if not exists review_prompt_sent_at timestamptz;
create index if not exists inquiries_review_prompt_idx on public.inquiries (status, event_date) where status = 'won' and review_prompt_sent_at is null;

-- Notification digests
alter table public.notifications add column if not exists digested_at timestamptz;
create index if not exists notifications_pending_digest_idx on public.notifications (user_id, created_at) where digested_at is null and read_at is null;
alter table public.profiles add column if not exists daily_digest_enabled boolean not null default true;

-- Saved searches
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  notify_new_matches boolean not null default true,
  last_notified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_searches_host_idx on public.saved_searches (host_id, created_at desc);
alter table public.saved_searches enable row level security;
create policy "saved_searches owner select" on public.saved_searches for select to authenticated using (host_id = auth.uid());
create policy "saved_searches owner insert" on public.saved_searches for insert to authenticated with check (host_id = auth.uid());
create policy "saved_searches owner update" on public.saved_searches for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
create policy "saved_searches owner delete" on public.saved_searches for delete to authenticated using (host_id = auth.uid());
create trigger saved_searches_updated before update on public.saved_searches for each row execute function public.tg_set_updated_at();

-- Seating
create table public.event_tables (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  capacity int not null default 8 check (capacity between 1 and 30),
  shape text not null default 'round' check (shape in ('round','rect')),
  display_order int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_tables_host_idx on public.event_tables (host_id, display_order, created_at);
alter table public.event_tables enable row level security;
create trigger event_tables_updated before update on public.event_tables for each row execute function public.tg_set_updated_at();
alter table public.event_guests
  add column if not exists table_id uuid references public.event_tables(id) on delete set null,
  add column if not exists seat_index int;
create index if not exists event_guests_table_idx on public.event_guests (table_id, seat_index);

-- Responder tier
alter table public.vendor_profiles
  add column if not exists responder_tier text check (responder_tier in ('fast','standard') or responder_tier is null);
create index if not exists vendor_profiles_responder_tier_idx on public.vendor_profiles (responder_tier) where responder_tier is not null;

-- Event timeline
create table public.event_timeline_items (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid references public.host_events(id) on delete cascade,
  start_time time not null,
  duration_minutes int,
  title text not null,
  owner_label text,
  vendor_id uuid references public.vendor_profiles(id) on delete set null,
  location text, notes text,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_timeline_items_event_idx on public.event_timeline_items (event_id, start_time, display_order);
create index event_timeline_items_host_idx on public.event_timeline_items (host_id, start_time);
alter table public.event_timeline_items enable row level security;
create trigger event_timeline_items_updated before update on public.event_timeline_items for each row execute function public.tg_set_updated_at();

-- Planning collaborators
create table public.planning_collaborators (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  unique (host_id, user_id)
);
create index planning_collaborators_user_idx on public.planning_collaborators (user_id);
create index planning_collaborators_host_idx on public.planning_collaborators (host_id);
alter table public.planning_collaborators enable row level security;

create or replace function public.is_planning_collaborator(_host_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.planning_collaborators where host_id = _host_id and user_id = auth.uid()) or _host_id = auth.uid()
$$;
create or replace function public.is_planning_editor(_host_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.planning_collaborators where host_id = _host_id and user_id = auth.uid() and role in ('owner','editor')) or _host_id = auth.uid()
$$;
grant execute on function public.is_planning_collaborator(uuid) to authenticated;
grant execute on function public.is_planning_editor(uuid) to authenticated;

create policy "planning_collaborators select teammates" on public.planning_collaborators for select to authenticated
  using (user_id = auth.uid() or public.is_planning_collaborator(host_id));
create policy "planning_collaborators host delete" on public.planning_collaborators for delete to authenticated
  using (host_id = auth.uid() and role <> 'owner');

create table public.planning_invites (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'editor' check (role in ('editor','viewer')),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index planning_invites_host_idx on public.planning_invites (host_id, accepted_at);
alter table public.planning_invites enable row level security;
create policy "planning_invites host select" on public.planning_invites for select to authenticated using (host_id = auth.uid());
create policy "planning_invites host insert" on public.planning_invites for insert to authenticated with check (host_id = auth.uid() and invited_by = auth.uid());
create policy "planning_invites host delete" on public.planning_invites for delete to authenticated using (host_id = auth.uid());

create or replace function public.accept_planning_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.planning_invites; v_user_id uuid := auth.uid(); v_user_email text;
begin
  if v_user_id is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  select * into v_invite from public.planning_invites where token = p_token;
  if v_invite.id is null then return jsonb_build_object('ok', false, 'error', 'invite_not_found'); end if;
  if v_invite.accepted_at is not null then return jsonb_build_object('ok', false, 'error', 'already_accepted'); end if;
  if v_invite.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  select email into v_user_email from auth.users where id = v_user_id;
  if v_user_email is not null and lower(v_user_email) <> lower(v_invite.email) then return jsonb_build_object('ok', false, 'error', 'email_mismatch'); end if;
  if v_invite.host_id = v_user_id then return jsonb_build_object('ok', false, 'error', 'self_invite'); end if;
  insert into public.planning_collaborators (host_id, user_id, role) values (v_invite.host_id, v_user_id, v_invite.role) on conflict (host_id, user_id) do nothing;
  update public.planning_invites set accepted_at = now() where id = v_invite.id;
  return jsonb_build_object('ok', true, 'host_id', v_invite.host_id);
end$$;
grant execute on function public.accept_planning_invite(text) to authenticated;

create or replace function public.get_planning_invite_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.planning_invites; v_host_name text;
begin
  select * into v_invite from public.planning_invites where token = p_token;
  if v_invite.id is null then return null; end if;
  select coalesce(display_name, 'A host') into v_host_name from public.profiles where id = v_invite.host_id;
  return jsonb_build_object('id', v_invite.id, 'email', v_invite.email, 'role', v_invite.role, 'expires_at', v_invite.expires_at, 'accepted_at', v_invite.accepted_at, 'host_name', v_host_name);
end$$;
grant execute on function public.get_planning_invite_by_token(text) to anon, authenticated;

-- Widen planning RLS via collaborator helpers
do $$ begin
  drop policy if exists "host_events host all" on public.host_events;
  drop policy if exists "event_guests host all" on public.event_guests;
  drop policy if exists "checklist_items host all" on public.checklist_items;
  drop policy if exists "budget_items host all" on public.budget_items;
  drop policy if exists "event_tasks host all" on public.event_tasks;
end $$;

create policy "host_events collaborator select" on public.host_events for select to authenticated using (public.is_planning_collaborator(host_id));
create policy "host_events editor insert" on public.host_events for insert to authenticated with check (public.is_planning_editor(host_id));
create policy "host_events editor update" on public.host_events for update to authenticated using (public.is_planning_editor(host_id));
create policy "host_events host delete" on public.host_events for delete to authenticated using (host_id = auth.uid());

create policy "event_guests collaborator select" on public.event_guests for select to authenticated using (public.is_planning_collaborator(host_id));
create policy "event_guests editor insert" on public.event_guests for insert to authenticated with check (public.is_planning_editor(host_id));
create policy "event_guests editor update" on public.event_guests for update to authenticated using (public.is_planning_editor(host_id));
create policy "event_guests editor delete" on public.event_guests for delete to authenticated using (public.is_planning_editor(host_id));

create policy "event_tables collaborator select" on public.event_tables for select to authenticated using (public.is_planning_collaborator(host_id));
create policy "event_tables editor insert" on public.event_tables for insert to authenticated with check (public.is_planning_editor(host_id));
create policy "event_tables editor update" on public.event_tables for update to authenticated using (public.is_planning_editor(host_id));
create policy "event_tables editor delete" on public.event_tables for delete to authenticated using (public.is_planning_editor(host_id));

create policy "event_timeline_items collaborator select" on public.event_timeline_items for select to authenticated using (public.is_planning_collaborator(host_id));
create policy "event_timeline_items editor insert" on public.event_timeline_items for insert to authenticated with check (public.is_planning_editor(host_id));
create policy "event_timeline_items editor update" on public.event_timeline_items for update to authenticated using (public.is_planning_editor(host_id));
create policy "event_timeline_items editor delete" on public.event_timeline_items for delete to authenticated using (public.is_planning_editor(host_id));

create policy "checklist_items collaborator select" on public.checklist_items for select to authenticated using (public.is_planning_collaborator(host_id));
create policy "checklist_items editor insert" on public.checklist_items for insert to authenticated with check (public.is_planning_editor(host_id));
create policy "checklist_items editor update" on public.checklist_items for update to authenticated using (public.is_planning_editor(host_id));
create policy "checklist_items editor delete" on public.checklist_items for delete to authenticated using (public.is_planning_editor(host_id));

create policy "budget_items collaborator select" on public.budget_items for select to authenticated using (public.is_planning_collaborator(host_id));
create policy "budget_items editor insert" on public.budget_items for insert to authenticated with check (public.is_planning_editor(host_id));
create policy "budget_items editor update" on public.budget_items for update to authenticated using (public.is_planning_editor(host_id));
create policy "budget_items editor delete" on public.budget_items for delete to authenticated using (public.is_planning_editor(host_id));

create policy "event_tasks collaborator select" on public.event_tasks for select to authenticated using (public.is_planning_collaborator(host_id));
create policy "event_tasks editor insert" on public.event_tasks for insert to authenticated with check (public.is_planning_editor(host_id));
create policy "event_tasks editor update" on public.event_tasks for update to authenticated using (public.is_planning_editor(host_id));
create policy "event_tasks editor delete" on public.event_tasks for delete to authenticated using (public.is_planning_editor(host_id));

do $$ begin
  drop policy if exists "mood_boards owner select" on public.mood_boards;
  drop policy if exists "mood_boards owner insert" on public.mood_boards;
  drop policy if exists "mood_boards owner update" on public.mood_boards;
  drop policy if exists "mood_boards owner delete" on public.mood_boards;
  drop policy if exists "mood_board_items owner select" on public.mood_board_items;
  drop policy if exists "mood_board_items owner insert" on public.mood_board_items;
  drop policy if exists "mood_board_items owner update" on public.mood_board_items;
  drop policy if exists "mood_board_items owner delete" on public.mood_board_items;
end $$;

create policy "mood_boards collaborator select" on public.mood_boards for select to authenticated using (public.is_planning_collaborator(host_id));
create policy "mood_boards editor insert" on public.mood_boards for insert to authenticated with check (public.is_planning_editor(host_id));
create policy "mood_boards editor update" on public.mood_boards for update to authenticated using (public.is_planning_editor(host_id));
create policy "mood_boards host delete" on public.mood_boards for delete to authenticated using (host_id = auth.uid());

create policy "mood_board_items collaborator select" on public.mood_board_items for select to authenticated
  using (exists (select 1 from public.mood_boards b where b.id = board_id and public.is_planning_collaborator(b.host_id)));
create policy "mood_board_items editor insert" on public.mood_board_items for insert to authenticated
  with check (exists (select 1 from public.mood_boards b where b.id = board_id and public.is_planning_editor(b.host_id)));
create policy "mood_board_items editor update" on public.mood_board_items for update to authenticated
  using (exists (select 1 from public.mood_boards b where b.id = board_id and public.is_planning_editor(b.host_id)));
create policy "mood_board_items editor delete" on public.mood_board_items for delete to authenticated
  using (exists (select 1 from public.mood_boards b where b.id = board_id and public.is_planning_editor(b.host_id)));