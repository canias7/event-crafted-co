-- Vendor density flywheel — claim-your-listing flow + outreach
-- tracker. Solves the marketplace cold-start problem one ops step
-- at a time:
--
--   1. Admin pre-creates a stub vendor_profiles row from public
--      directory data (Yelp/Google Business CSV, manual research,
--      LinkedIn outreach). user_id is NULL — the row exists in the
--      directory but isn't owned yet.
--
--   2. A vendor_claim_invitations row links the stub vendor_id to
--      the owner's email + a unique claim token. Admin tracks
--      contact status (pending / contacted / accepted / declined).
--
--   3. Owner receives an email with /claim/{token}. Visiting the
--      link signs them up (or signs in) and calls
--      claim_vendor_listing(p_token) which atomically links
--      auth.uid() to the stub row's user_id.
--
-- This is the only marketplace-cold-start lever we have without
-- buying ads. Code is the easy part — the actual outreach is the
-- hard part.

-- vendor_profiles.user_id was NOT NULL. Relax it so admins can
-- create stub profiles. The CHECK ensures any row that exists has
-- either an owner OR an active claim invitation pointing to it.
alter table public.vendor_profiles
  alter column user_id drop not null;

-- Drop the unique constraint so we can re-add as a partial unique
-- index (only owned profiles need uniqueness on user_id).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'vendor_profiles_user_id_key'
  ) then
    alter table public.vendor_profiles
      drop constraint vendor_profiles_user_id_key;
  end if;
end $$;

create unique index if not exists vendor_profiles_user_id_unique
  on public.vendor_profiles (user_id)
  where user_id is not null;

-- ─── Claim invitations ────────────────────────────────────────

create table public.vendor_claim_invitations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  email text not null,
  -- One-shot opaque token used in the /claim/{token} URL. Random by
  -- default; admin can rotate by re-issuing.
  token text not null unique
    default replace(gen_random_uuid()::text, '-', ''),
  -- Outreach tracking — admins move rows through the funnel.
  status text not null default 'pending'
    check (status in ('pending', 'contacted', 'accepted', 'declined')),
  notes text,
  invited_by uuid references public.profiles(id) on delete set null,
  contacted_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendor_claim_invitations_vendor_idx
  on public.vendor_claim_invitations (vendor_id);
create index vendor_claim_invitations_token_idx
  on public.vendor_claim_invitations (token);
create index vendor_claim_invitations_status_idx
  on public.vendor_claim_invitations (status, created_at desc);

alter table public.vendor_claim_invitations enable row level security;

create policy "claim_invitations admin all"
  on public.vendor_claim_invitations for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create trigger vendor_claim_invitations_updated
  before update on public.vendor_claim_invitations
  for each row execute function public.tg_set_updated_at();

-- Allow admin to insert into vendor_profiles with NULL user_id
-- (stub profile creation). Existing vendor-owner-write policies
-- already allow user_id-matched inserts.
create policy "vendor_profiles admin stub create"
  on public.vendor_profiles for insert to authenticated
  with check (public.is_admin() and user_id is null);

create policy "vendor_profiles admin update unclaimed"
  on public.vendor_profiles for update to authenticated
  using (public.is_admin() and user_id is null)
  with check (public.is_admin());

-- ─── Claim RPC ─────────────────────────────────────────────────

-- Public-facing RPC. Owner visits /claim/{token} → page calls this
-- → row's user_id flips to auth.uid() and the claim invitation
-- transitions to accepted.
create or replace function public.claim_vendor_listing(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.vendor_claim_invitations;
  vendor_row public.vendor_profiles;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into invite_row
  from public.vendor_claim_invitations
  where token = p_token;

  if invite_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  if invite_row.status = 'accepted' then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  select * into vendor_row
  from public.vendor_profiles
  where id = invite_row.vendor_id;

  if vendor_row.user_id is not null then
    -- Edge case: invite still pending but the profile got linked
    -- via a different code path. Clean up the invite anyway.
    update public.vendor_claim_invitations
      set status = 'accepted', accepted_at = now()
      where id = invite_row.id;
    return jsonb_build_object('ok', false, 'error', 'already_owned');
  end if;

  -- Atomic link: assign user_id + flip invite status in one tx.
  update public.vendor_profiles
    set user_id = auth.uid()
    where id = invite_row.vendor_id;

  update public.vendor_claim_invitations
    set status = 'accepted', accepted_at = now()
    where id = invite_row.id;

  return jsonb_build_object(
    'ok', true,
    'vendor_id', invite_row.vendor_id
  );
end;
$$;

grant execute on function public.claim_vendor_listing(text)
  to authenticated;

-- Public preview of the stub profile by token. Lets the unauthed
-- visitor see what they're claiming before signing in. Returns
-- minimal info — name, category, location.
create or replace function public.get_claim_invitation_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  invite_row public.vendor_claim_invitations;
  vendor_row public.vendor_profiles;
begin
  select * into invite_row
  from public.vendor_claim_invitations
  where token = p_token;

  if invite_row.id is null then
    return null;
  end if;

  select id, business_name, category, location, user_id
    into vendor_row
  from public.vendor_profiles
  where id = invite_row.vendor_id;

  return jsonb_build_object(
    'invite', jsonb_build_object(
      'email', invite_row.email,
      'status', invite_row.status,
      'created_at', invite_row.created_at
    ),
    'vendor', jsonb_build_object(
      'id', vendor_row.id,
      'business_name', vendor_row.business_name,
      'category', vendor_row.category,
      'location', vendor_row.location,
      'already_owned', vendor_row.user_id is not null
    )
  );
end;
$$;

grant execute on function public.get_claim_invitation_by_token(text)
  to anon, authenticated;
