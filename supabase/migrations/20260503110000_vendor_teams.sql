-- Vendor team accounts: a vendor business can have multiple authenticated
-- users with access to the same vendor_profile. Owner (vendor_profiles.user_id)
-- is auto-backfilled as a member with role='owner'; new members are added via
-- email invites that resolve at /accept-team-invite/<token>.
--
-- Roles:
--   owner  — the original creator; can invite/remove members. Cannot be removed.
--   admin  — can invite/remove other members (not the owner).
--   member — full operational access (inbox, profile, templates, availability,
--            portfolio, proposals) but cannot manage team.
--
-- The is_vendor_owner() / can_access_inquiry() helpers are widened to treat
-- any team member as the vendor for RLS purposes, so existing policies just
-- start working for team members without per-policy churn.

create table public.vendor_team_members (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  unique (vendor_id, user_id)
);

create index vendor_team_members_user_idx
  on public.vendor_team_members (user_id);

create index vendor_team_members_vendor_idx
  on public.vendor_team_members (vendor_id);

alter table public.vendor_team_members enable row level security;

-- A user can read their own membership rows + all members of vendors they
-- belong to (so the team page can list everyone).
create policy "vendor_team_members select own teammates"
  on public.vendor_team_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.vendor_team_members m
      where m.vendor_id = vendor_team_members.vendor_id
        and m.user_id = auth.uid()
    )
  );

-- Owner/admin of a vendor can add / remove members. Inserts also happen via
-- the SECURITY DEFINER accept_team_invite RPC, which bypasses these policies.
create policy "vendor_team_members manage by owner/admin"
  on public.vendor_team_members for delete
  to authenticated
  using (
    exists (
      select 1 from public.vendor_team_members m
      where m.vendor_id = vendor_team_members.vendor_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
    -- Don't allow removing the owner row.
    and role <> 'owner'
  );

-- Pending invites by email. share via /accept-team-invite/<token>.
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

create index vendor_team_invites_vendor_idx
  on public.vendor_team_invites (vendor_id, accepted_at);

create index vendor_team_invites_email_idx
  on public.vendor_team_invites (lower(email));

alter table public.vendor_team_invites enable row level security;

-- Vendors with owner/admin role see invites for their team. Acceptors look
-- the invite up via the SECURITY DEFINER accept_team_invite RPC, no RLS
-- bypass needed for them.
create policy "vendor_team_invites manage by owner/admin"
  on public.vendor_team_invites for select
  to authenticated
  using (
    exists (
      select 1 from public.vendor_team_members m
      where m.vendor_id = vendor_team_invites.vendor_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );

create policy "vendor_team_invites insert by owner/admin"
  on public.vendor_team_invites for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and exists (
      select 1 from public.vendor_team_members m
      where m.vendor_id = vendor_team_invites.vendor_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );

create policy "vendor_team_invites delete by owner/admin"
  on public.vendor_team_invites for delete
  to authenticated
  using (
    exists (
      select 1 from public.vendor_team_members m
      where m.vendor_id = vendor_team_invites.vendor_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );

-- Backfill: every existing vendor_profile becomes an owner membership row.
insert into public.vendor_team_members (vendor_id, user_id, role)
select id, user_id, 'owner'
from public.vendor_profiles
where user_id is not null
on conflict (vendor_id, user_id) do nothing;

-- When a vendor_profile is created (via /vendor-apply), auto-add the creator
-- as an owner so they immediately get team access.
create or replace function public.tg_vendor_profiles_add_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    insert into public.vendor_team_members (vendor_id, user_id, role)
    values (new.id, new.user_id, 'owner')
    on conflict (vendor_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_profiles_add_owner on public.vendor_profiles;
create trigger vendor_profiles_add_owner
  after insert on public.vendor_profiles
  for each row execute function public.tg_vendor_profiles_add_owner();

-- Widen the helper functions used in RLS policies so team members count as
-- the vendor for access checks (inbox, messages, etc.). Same signature, same
-- name — drop-in replacement.
create or replace function public.is_vendor_owner(_vendor_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.vendor_team_members m
    where m.vendor_id = _vendor_id and m.user_id = auth.uid()
  )
$$;

create or replace function public.can_access_inquiry(_inquiry_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.inquiries i
    where i.id = _inquiry_id
      and (
        i.host_id = auth.uid()
        or exists (
          select 1 from public.vendor_team_members m
          where m.vendor_id = i.vendor_id and m.user_id = auth.uid()
        )
      )
  )
$$;

grant execute on function public.is_vendor_owner(uuid) to authenticated;
grant execute on function public.can_access_inquiry(uuid) to authenticated;

-- New helper: explicit name for clarity in new policies. Same behavior
-- as the widened is_vendor_owner.
create or replace function public.is_vendor_member(_vendor_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.vendor_team_members m
    where m.vendor_id = _vendor_id and m.user_id = auth.uid()
  )
$$;

grant execute on function public.is_vendor_member(uuid) to authenticated;

-- Refactor inline policies on tables that team members must be able to
-- mutate. Each was previously gated by `vp.user_id = auth.uid()`, which
-- only the owner satisfied. Use is_vendor_member to extend access.
do $$
begin
  -- vendor_unavailable_dates
  drop policy if exists "vendor_unavailable_dates owner insert" on public.vendor_unavailable_dates;
  drop policy if exists "vendor_unavailable_dates owner update" on public.vendor_unavailable_dates;
  drop policy if exists "vendor_unavailable_dates owner delete" on public.vendor_unavailable_dates;

  create policy "vendor_unavailable_dates member insert"
    on public.vendor_unavailable_dates for insert to authenticated
    with check (public.is_vendor_member(vendor_id));
  create policy "vendor_unavailable_dates member update"
    on public.vendor_unavailable_dates for update to authenticated
    using (public.is_vendor_member(vendor_id));
  create policy "vendor_unavailable_dates member delete"
    on public.vendor_unavailable_dates for delete to authenticated
    using (public.is_vendor_member(vendor_id));

  -- vendor_message_templates
  drop policy if exists "vendor_message_templates owner insert" on public.vendor_message_templates;
  drop policy if exists "vendor_message_templates owner update" on public.vendor_message_templates;
  drop policy if exists "vendor_message_templates owner delete" on public.vendor_message_templates;

  create policy "vendor_message_templates member insert"
    on public.vendor_message_templates for insert to authenticated
    with check (public.is_vendor_member(vendor_id));
  create policy "vendor_message_templates member update"
    on public.vendor_message_templates for update to authenticated
    using (public.is_vendor_member(vendor_id));
  create policy "vendor_message_templates member delete"
    on public.vendor_message_templates for delete to authenticated
    using (public.is_vendor_member(vendor_id));

  -- vendor_portfolio_images
  drop policy if exists "vendor_portfolio_images owner insert" on public.vendor_portfolio_images;
  drop policy if exists "vendor_portfolio_images owner update" on public.vendor_portfolio_images;
  drop policy if exists "vendor_portfolio_images owner delete" on public.vendor_portfolio_images;

  create policy "vendor_portfolio_images member insert"
    on public.vendor_portfolio_images for insert to authenticated
    with check (public.is_vendor_member(vendor_id));
  create policy "vendor_portfolio_images member update"
    on public.vendor_portfolio_images for update to authenticated
    using (public.is_vendor_member(vendor_id));
  create policy "vendor_portfolio_images member delete"
    on public.vendor_portfolio_images for delete to authenticated
    using (public.is_vendor_member(vendor_id));

  -- proposals: widen vendor-side checks to team members. Host policies are
  -- left alone (auth.uid() = host_id is unaffected by team refactor).
  drop policy if exists "proposals participants select" on public.proposals;
  drop policy if exists "proposals vendor insert" on public.proposals;
  drop policy if exists "proposals vendor update" on public.proposals;

  create policy "proposals participants select"
    on public.proposals for select to authenticated
    using (auth.uid() = host_id or public.is_vendor_member(vendor_id));
  create policy "proposals vendor insert"
    on public.proposals for insert to authenticated
    with check (public.is_vendor_member(vendor_id));
  create policy "proposals vendor update"
    on public.proposals for update to authenticated
    using (public.is_vendor_member(vendor_id));
end$$;

-- vendor_profiles update by team members. The original policy was for the
-- owner only — open it up to admin/owner roles (members are read-only on
-- the profile itself; they edit via dedicated tools).
drop policy if exists "vendor_profiles update own" on public.vendor_profiles;
create policy "vendor_profiles team admin update"
  on public.vendor_profiles for update to authenticated
  using (
    exists (
      select 1 from public.vendor_team_members m
      where m.vendor_id = vendor_profiles.id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );

-- Storage policies for vendor-portfolios bucket: replace the inline
-- `vp.user_id = auth.uid()` checks with the helper. Storage policies have
-- to be dropped/recreated by name.
drop policy if exists "vendor portfolios owner insert" on storage.objects;
drop policy if exists "vendor portfolios owner delete" on storage.objects;

create policy "vendor portfolios member insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vendor-portfolios'
    and public.is_vendor_member(((storage.foldername(name))[1])::uuid)
  );

create policy "vendor portfolios member delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vendor-portfolios'
    and public.is_vendor_member(((storage.foldername(name))[1])::uuid)
  );

-- Accept team invite. Validates token + email match (best effort, since
-- the user might not have set their email visibility), then inserts
-- membership and marks the invite accepted.
create or replace function public.accept_team_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.vendor_team_invites;
  v_user_id uuid := auth.uid();
  v_user_email text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_invite
  from public.vendor_team_invites
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

  -- Best-effort email match — pull from auth.users. If the row is missing
  -- the check is skipped (don't 500 the user).
  select email into v_user_email from auth.users where id = v_user_id;
  if v_user_email is not null
     and lower(v_user_email) <> lower(v_invite.email) then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  insert into public.vendor_team_members (vendor_id, user_id, role)
  values (v_invite.vendor_id, v_user_id, v_invite.role)
  on conflict (vendor_id, user_id) do nothing;

  update public.vendor_team_invites
  set accepted_at = now()
  where id = v_invite.id;

  return jsonb_build_object('ok', true, 'vendor_id', v_invite.vendor_id);
end;
$$;

grant execute on function public.accept_team_invite(text) to authenticated;

-- Public lookup of an invite by token, so the accept page can show the
-- vendor name + role before the user clicks "Accept". Returns enough to
-- render the page; nothing sensitive (no email of inviter).
create or replace function public.get_team_invite_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.vendor_team_invites;
  v_business_name text;
begin
  select * into v_invite
  from public.vendor_team_invites
  where token = p_token;

  if v_invite.id is null then
    return null;
  end if;

  select business_name into v_business_name
  from public.vendor_profiles
  where id = v_invite.vendor_id;

  return jsonb_build_object(
    'id', v_invite.id,
    'email', v_invite.email,
    'role', v_invite.role,
    'expires_at', v_invite.expires_at,
    'accepted_at', v_invite.accepted_at,
    'business_name', v_business_name
  );
end;
$$;

grant execute on function public.get_team_invite_by_token(text) to anon, authenticated;
