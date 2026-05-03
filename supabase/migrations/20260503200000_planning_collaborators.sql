-- Planning collaborators: hosts can invite their partner, MOH, planner,
-- etc. to share their planning workspace (events, guests, checklist,
-- budget, tasks, timeline, seating, mood boards).
--
-- Mirrors the vendor team pattern: collaborators table + invites table
-- + accept RPC + is_planning_collaborator() helper used to widen RLS
-- on host-scoped planning tables.
--
-- Roles:
--   owner  — the host themselves (auto, can't be removed)
--   editor — can read + write everything in the workspace
--   viewer — can read but not write

create table public.planning_collaborators (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor'
    check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  unique (host_id, user_id)
);

create index planning_collaborators_user_idx
  on public.planning_collaborators (user_id);

create index planning_collaborators_host_idx
  on public.planning_collaborators (host_id);

alter table public.planning_collaborators enable row level security;

-- SECURITY DEFINER helpers — bypass RLS to avoid recursion when used
-- in policies that reference planning_collaborators.
create or replace function public.is_planning_collaborator(_host_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.planning_collaborators
    where host_id = _host_id and user_id = auth.uid()
  ) or _host_id = auth.uid()
$$;

create or replace function public.is_planning_editor(_host_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.planning_collaborators
    where host_id = _host_id
      and user_id = auth.uid()
      and role in ('owner','editor')
  ) or _host_id = auth.uid()
$$;

grant execute on function public.is_planning_collaborator(uuid) to authenticated;
grant execute on function public.is_planning_editor(uuid) to authenticated;

-- Policies on the collaborators table itself.
create policy "planning_collaborators select teammates"
  on public.planning_collaborators for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_planning_collaborator(host_id)
  );

create policy "planning_collaborators host delete"
  on public.planning_collaborators for delete
  to authenticated
  using (host_id = auth.uid() and role <> 'owner');

-- Invites table.
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

create index planning_invites_host_idx
  on public.planning_invites (host_id, accepted_at);

alter table public.planning_invites enable row level security;

create policy "planning_invites host select"
  on public.planning_invites for select
  to authenticated
  using (host_id = auth.uid());

create policy "planning_invites host insert"
  on public.planning_invites for insert
  to authenticated
  with check (host_id = auth.uid() and invited_by = auth.uid());

create policy "planning_invites host delete"
  on public.planning_invites for delete
  to authenticated
  using (host_id = auth.uid());

-- Accept invite — same shape as accept_team_invite.
create or replace function public.accept_planning_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.planning_invites;
  v_user_id uuid := auth.uid();
  v_user_email text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_invite
  from public.planning_invites
  where token = p_token;

  if v_invite.id is null then
    return jsonb_build_object('ok', false, 'error', 'invite_not_found');
  end if;

  if v_invite.accepted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_accepted');
  end if;

  if v_invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  select email into v_user_email from auth.users where id = v_user_id;
  if v_user_email is not null
     and lower(v_user_email) <> lower(v_invite.email) then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  -- Self-invite would create an "owner" duplicate — block it cleanly.
  if v_invite.host_id = v_user_id then
    return jsonb_build_object('ok', false, 'error', 'self_invite');
  end if;

  insert into public.planning_collaborators (host_id, user_id, role)
  values (v_invite.host_id, v_user_id, v_invite.role)
  on conflict (host_id, user_id) do nothing;

  update public.planning_invites
  set accepted_at = now()
  where id = v_invite.id;

  return jsonb_build_object('ok', true, 'host_id', v_invite.host_id);
end;
$$;

grant execute on function public.accept_planning_invite(text) to authenticated;

-- Public lookup of an invite by token.
create or replace function public.get_planning_invite_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.planning_invites;
  v_host_name text;
begin
  select * into v_invite
  from public.planning_invites
  where token = p_token;

  if v_invite.id is null then
    return null;
  end if;

  select coalesce(display_name, 'A host') into v_host_name
  from public.profiles
  where id = v_invite.host_id;

  return jsonb_build_object(
    'id', v_invite.id,
    'email', v_invite.email,
    'role', v_invite.role,
    'expires_at', v_invite.expires_at,
    'accepted_at', v_invite.accepted_at,
    'host_name', v_host_name
  );
end;
$$;

grant execute on function public.get_planning_invite_by_token(text)
  to anon, authenticated;

-- Widen RLS on host-scoped planning tables. Each existing policy is
-- replaced with one that uses is_planning_collaborator (read) or
-- is_planning_editor (write) instead of the inline auth.uid() = host_id
-- check. Owners satisfy both helpers (the helpers return true when
-- _host_id = auth.uid()), so the original behavior is preserved.

-- host_events
do $$
begin
  drop policy if exists "host_events host all" on public.host_events;
  drop policy if exists "host_events host select" on public.host_events;
  drop policy if exists "host_events host insert" on public.host_events;
  drop policy if exists "host_events host update" on public.host_events;
  drop policy if exists "host_events host delete" on public.host_events;
end$$;

create policy "host_events collaborator select"
  on public.host_events for select to authenticated
  using (public.is_planning_collaborator(host_id));
create policy "host_events editor insert"
  on public.host_events for insert to authenticated
  with check (public.is_planning_editor(host_id));
create policy "host_events editor update"
  on public.host_events for update to authenticated
  using (public.is_planning_editor(host_id));
create policy "host_events host delete"
  on public.host_events for delete to authenticated
  using (host_id = auth.uid());

-- event_guests
do $$
begin
  drop policy if exists "event_guests host all" on public.event_guests;
end$$;

create policy "event_guests collaborator select"
  on public.event_guests for select to authenticated
  using (public.is_planning_collaborator(host_id));
create policy "event_guests editor insert"
  on public.event_guests for insert to authenticated
  with check (public.is_planning_editor(host_id));
create policy "event_guests editor update"
  on public.event_guests for update to authenticated
  using (public.is_planning_editor(host_id));
create policy "event_guests editor delete"
  on public.event_guests for delete to authenticated
  using (public.is_planning_editor(host_id));

-- event_tables
do $$
begin
  drop policy if exists "event_tables host all" on public.event_tables;
end$$;

create policy "event_tables collaborator select"
  on public.event_tables for select to authenticated
  using (public.is_planning_collaborator(host_id));
create policy "event_tables editor insert"
  on public.event_tables for insert to authenticated
  with check (public.is_planning_editor(host_id));
create policy "event_tables editor update"
  on public.event_tables for update to authenticated
  using (public.is_planning_editor(host_id));
create policy "event_tables editor delete"
  on public.event_tables for delete to authenticated
  using (public.is_planning_editor(host_id));

-- event_timeline_items
do $$
begin
  drop policy if exists "event_timeline_items host all" on public.event_timeline_items;
end$$;

create policy "event_timeline_items collaborator select"
  on public.event_timeline_items for select to authenticated
  using (public.is_planning_collaborator(host_id));
create policy "event_timeline_items editor insert"
  on public.event_timeline_items for insert to authenticated
  with check (public.is_planning_editor(host_id));
create policy "event_timeline_items editor update"
  on public.event_timeline_items for update to authenticated
  using (public.is_planning_editor(host_id));
create policy "event_timeline_items editor delete"
  on public.event_timeline_items for delete to authenticated
  using (public.is_planning_editor(host_id));

-- checklist_items + budget_items (from planning_tools migration). The
-- original policy was a single FOR ALL rule with auth.uid() = host_id;
-- replace with split policies that distinguish read (collaborator) vs
-- write (editor).
do $$
begin
  drop policy if exists "checklist_items host all" on public.checklist_items;
  drop policy if exists "budget_items host all" on public.budget_items;
end$$;

create policy "checklist_items collaborator select"
  on public.checklist_items for select to authenticated
  using (public.is_planning_collaborator(host_id));
create policy "checklist_items editor insert"
  on public.checklist_items for insert to authenticated
  with check (public.is_planning_editor(host_id));
create policy "checklist_items editor update"
  on public.checklist_items for update to authenticated
  using (public.is_planning_editor(host_id));
create policy "checklist_items editor delete"
  on public.checklist_items for delete to authenticated
  using (public.is_planning_editor(host_id));

create policy "budget_items collaborator select"
  on public.budget_items for select to authenticated
  using (public.is_planning_collaborator(host_id));
create policy "budget_items editor insert"
  on public.budget_items for insert to authenticated
  with check (public.is_planning_editor(host_id));
create policy "budget_items editor update"
  on public.budget_items for update to authenticated
  using (public.is_planning_editor(host_id));
create policy "budget_items editor delete"
  on public.budget_items for delete to authenticated
  using (public.is_planning_editor(host_id));

-- event_tasks
do $$
begin
  drop policy if exists "event_tasks host all" on public.event_tasks;
end$$;

create policy "event_tasks collaborator select"
  on public.event_tasks for select to authenticated
  using (public.is_planning_collaborator(host_id));
create policy "event_tasks editor insert"
  on public.event_tasks for insert to authenticated
  with check (public.is_planning_editor(host_id));
create policy "event_tasks editor update"
  on public.event_tasks for update to authenticated
  using (public.is_planning_editor(host_id));
create policy "event_tasks editor delete"
  on public.event_tasks for delete to authenticated
  using (public.is_planning_editor(host_id));

-- mood_boards + mood_board_items. Boards already have a public share
-- token for view-only access; collaborators get write too via the
-- editor helper. Keep the existing public-token paths untouched.
do $$
begin
  drop policy if exists "mood_boards owner select" on public.mood_boards;
  drop policy if exists "mood_boards owner insert" on public.mood_boards;
  drop policy if exists "mood_boards owner update" on public.mood_boards;
  drop policy if exists "mood_boards owner delete" on public.mood_boards;
end$$;

create policy "mood_boards collaborator select"
  on public.mood_boards for select to authenticated
  using (public.is_planning_collaborator(host_id));
create policy "mood_boards editor insert"
  on public.mood_boards for insert to authenticated
  with check (public.is_planning_editor(host_id));
create policy "mood_boards editor update"
  on public.mood_boards for update to authenticated
  using (public.is_planning_editor(host_id));
create policy "mood_boards host delete"
  on public.mood_boards for delete to authenticated
  using (host_id = auth.uid());

do $$
begin
  drop policy if exists "mood_board_items owner select" on public.mood_board_items;
  drop policy if exists "mood_board_items owner insert" on public.mood_board_items;
  drop policy if exists "mood_board_items owner update" on public.mood_board_items;
  drop policy if exists "mood_board_items owner delete" on public.mood_board_items;
end$$;

create policy "mood_board_items collaborator select"
  on public.mood_board_items for select to authenticated
  using (
    exists (
      select 1 from public.mood_boards b
      where b.id = board_id
        and public.is_planning_collaborator(b.host_id)
    )
  );
create policy "mood_board_items editor insert"
  on public.mood_board_items for insert to authenticated
  with check (
    exists (
      select 1 from public.mood_boards b
      where b.id = board_id
        and public.is_planning_editor(b.host_id)
    )
  );
create policy "mood_board_items editor update"
  on public.mood_board_items for update to authenticated
  using (
    exists (
      select 1 from public.mood_boards b
      where b.id = board_id
        and public.is_planning_editor(b.host_id)
    )
  );
create policy "mood_board_items editor delete"
  on public.mood_board_items for delete to authenticated
  using (
    exists (
      select 1 from public.mood_boards b
      where b.id = board_id
        and public.is_planning_editor(b.host_id)
    )
  );
