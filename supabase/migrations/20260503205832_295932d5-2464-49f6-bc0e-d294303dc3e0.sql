create table public.vendor_team_members (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  unique (vendor_id, user_id)
);
create index vendor_team_members_user_idx on public.vendor_team_members (user_id);
create index vendor_team_members_vendor_idx on public.vendor_team_members (vendor_id);
alter table public.vendor_team_members enable row level security;

create table public.vendor_team_invites (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member')),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index vendor_team_invites_vendor_idx on public.vendor_team_invites (vendor_id, accepted_at);
create index vendor_team_invites_email_idx on public.vendor_team_invites (lower(email));
alter table public.vendor_team_invites enable row level security;

insert into public.vendor_team_members (vendor_id, user_id, role)
select id, user_id, 'owner' from public.vendor_profiles where user_id is not null
on conflict (vendor_id, user_id) do nothing;

create or replace function public.tg_vendor_profiles_add_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then
    insert into public.vendor_team_members (vendor_id, user_id, role)
    values (new.id, new.user_id, 'owner') on conflict (vendor_id, user_id) do nothing;
  end if;
  return new;
end$$;
drop trigger if exists vendor_profiles_add_owner on public.vendor_profiles;
create trigger vendor_profiles_add_owner after insert on public.vendor_profiles
  for each row execute function public.tg_vendor_profiles_add_owner();

create or replace function public.is_vendor_owner(_vendor_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vendor_team_members m where m.vendor_id = _vendor_id and m.user_id = auth.uid())
$$;

create or replace function public.can_access_inquiry(_inquiry_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.inquiries i where i.id = _inquiry_id
    and (i.host_id = auth.uid() or exists (select 1 from public.vendor_team_members m where m.vendor_id = i.vendor_id and m.user_id = auth.uid())))
$$;

create or replace function public.is_vendor_member(_vendor_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vendor_team_members m where m.vendor_id = _vendor_id and m.user_id = auth.uid())
$$;

create or replace function public.is_vendor_team_admin(_vendor_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vendor_team_members m where m.vendor_id = _vendor_id and m.user_id = auth.uid() and m.role in ('owner','admin'))
$$;

create or replace function public.shares_vendor_team(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vendor_team_members me join public.vendor_team_members them on them.vendor_id = me.vendor_id where me.user_id = auth.uid() and them.user_id = _user_id)
$$;

grant execute on function public.is_vendor_owner(uuid) to authenticated;
grant execute on function public.can_access_inquiry(uuid) to authenticated;
grant execute on function public.is_vendor_member(uuid) to authenticated;
grant execute on function public.is_vendor_team_admin(uuid) to authenticated;
grant execute on function public.shares_vendor_team(uuid) to authenticated;

-- vendor_team_members policies (use helpers to avoid recursion)
create policy "vendor_team_members select teammates" on public.vendor_team_members for select to authenticated
  using (user_id = auth.uid() or public.is_vendor_member(vendor_id));
create policy "vendor_team_members admin delete" on public.vendor_team_members for delete to authenticated
  using (public.is_vendor_team_admin(vendor_id) and role <> 'owner');

-- vendor_team_invites policies
create policy "vendor_team_invites admin select" on public.vendor_team_invites for select to authenticated
  using (public.is_vendor_team_admin(vendor_id));
create policy "vendor_team_invites admin insert" on public.vendor_team_invites for insert to authenticated
  with check (invited_by = auth.uid() and public.is_vendor_team_admin(vendor_id));
create policy "vendor_team_invites admin delete" on public.vendor_team_invites for delete to authenticated
  using (public.is_vendor_team_admin(vendor_id));

-- Refactor existing policies to use helpers
do $$
begin
  drop policy if exists "vendor_unavailable_dates owner insert" on public.vendor_unavailable_dates;
  drop policy if exists "vendor_unavailable_dates owner update" on public.vendor_unavailable_dates;
  drop policy if exists "vendor_unavailable_dates owner delete" on public.vendor_unavailable_dates;
  create policy "vendor_unavailable_dates member insert" on public.vendor_unavailable_dates for insert to authenticated with check (public.is_vendor_member(vendor_id));
  create policy "vendor_unavailable_dates member update" on public.vendor_unavailable_dates for update to authenticated using (public.is_vendor_member(vendor_id));
  create policy "vendor_unavailable_dates member delete" on public.vendor_unavailable_dates for delete to authenticated using (public.is_vendor_member(vendor_id));

  drop policy if exists "vendor_message_templates owner all" on public.vendor_message_templates;
  create policy "vendor_message_templates member all" on public.vendor_message_templates for all to authenticated
    using (public.is_vendor_member(vendor_id)) with check (public.is_vendor_member(vendor_id));

  drop policy if exists "vendor_portfolio_images owner insert" on public.vendor_portfolio_images;
  drop policy if exists "vendor_portfolio_images owner update" on public.vendor_portfolio_images;
  drop policy if exists "vendor_portfolio_images owner delete" on public.vendor_portfolio_images;
  create policy "vendor_portfolio_images member insert" on public.vendor_portfolio_images for insert to authenticated with check (public.is_vendor_member(vendor_id));
  create policy "vendor_portfolio_images member update" on public.vendor_portfolio_images for update to authenticated using (public.is_vendor_member(vendor_id));
  create policy "vendor_portfolio_images member delete" on public.vendor_portfolio_images for delete to authenticated using (public.is_vendor_member(vendor_id));

  drop policy if exists "proposals participants select" on public.proposals;
  drop policy if exists "proposals vendor insert" on public.proposals;
  drop policy if exists "proposals vendor update" on public.proposals;
  create policy "proposals participants select" on public.proposals for select to authenticated using (auth.uid() = host_id or public.is_vendor_member(vendor_id));
  create policy "proposals vendor insert" on public.proposals for insert to authenticated with check (public.is_vendor_member(vendor_id));
  create policy "proposals vendor update" on public.proposals for update to authenticated using (public.is_vendor_member(vendor_id));
end$$;

drop policy if exists "vendor_profiles update own" on public.vendor_profiles;
create policy "vendor_profiles team admin update" on public.vendor_profiles for update to authenticated using (public.is_vendor_team_admin(id));

create policy "profiles select teammates" on public.profiles for select to authenticated using (public.shares_vendor_team(id));

-- Storage policies for vendor-portfolios bucket
drop policy if exists "vendor portfolios owner insert" on storage.objects;
drop policy if exists "vendor portfolios owner delete" on storage.objects;
create policy "vendor portfolios member insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'vendor-portfolios' and public.is_vendor_member(((storage.foldername(name))[1])::uuid));
create policy "vendor portfolios member delete" on storage.objects for delete to authenticated
  using (bucket_id = 'vendor-portfolios' and public.is_vendor_member(((storage.foldername(name))[1])::uuid));

-- Accept invite RPC
create or replace function public.accept_team_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.vendor_team_invites; v_user_id uuid := auth.uid(); v_user_email text;
begin
  if v_user_id is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  select * into v_invite from public.vendor_team_invites where token = p_token;
  if v_invite.id is null then return jsonb_build_object('ok', false, 'error', 'invite_not_found'); end if;
  if v_invite.accepted_at is not null then return jsonb_build_object('ok', false, 'error', 'already_accepted'); end if;
  if v_invite.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  select email into v_user_email from auth.users where id = v_user_id;
  if v_user_email is not null and lower(v_user_email) <> lower(v_invite.email) then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;
  insert into public.vendor_team_members (vendor_id, user_id, role) values (v_invite.vendor_id, v_user_id, v_invite.role)
    on conflict (vendor_id, user_id) do nothing;
  update public.vendor_team_invites set accepted_at = now() where id = v_invite.id;
  return jsonb_build_object('ok', true, 'vendor_id', v_invite.vendor_id);
end$$;
grant execute on function public.accept_team_invite(text) to authenticated;

create or replace function public.get_team_invite_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.vendor_team_invites; v_business_name text;
begin
  select * into v_invite from public.vendor_team_invites where token = p_token;
  if v_invite.id is null then return null; end if;
  select business_name into v_business_name from public.vendor_profiles where id = v_invite.vendor_id;
  return jsonb_build_object('email', v_invite.email, 'role', v_invite.role,
    'business_name', v_business_name, 'expires_at', v_invite.expires_at, 'accepted_at', v_invite.accepted_at);
end$$;
grant execute on function public.get_team_invite_by_token(text) to anon, authenticated;