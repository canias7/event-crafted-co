-- Vendor referral program: a vendor invites another vendor to join
-- Vendora. When the invitee signs up + creates a vendor profile via
-- the referral link, both vendors get a commission discount on their
-- next confirmed booking.
--
-- The reward isn't applied here (Stripe isn't wired); we record the
-- relationship + discount eligibility so when payments land, the
-- system can apply the reduced commission.

create table public.vendor_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.vendor_profiles(id) on delete cascade,
  email text not null,
  referral_code text not null unique
    default replace(gen_random_uuid()::text, '-', ''),
  -- When the invitee signs up + creates a vendor profile, link them here.
  referred_id uuid references public.vendor_profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','signed_up','first_booking','rewarded','expired')),
  reward_percent_off numeric(5,2) not null default 1.0,
  -- Track when the invitee crosses each milestone for analytics.
  signed_up_at timestamptz,
  first_booking_at timestamptz,
  rewarded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '90 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendor_referrals_referrer_idx
  on public.vendor_referrals (referrer_id, status);

create index vendor_referrals_email_idx
  on public.vendor_referrals (lower(email));

create index vendor_referrals_code_idx
  on public.vendor_referrals (referral_code);

alter table public.vendor_referrals enable row level security;

create policy "vendor_referrals member select"
  on public.vendor_referrals for select to authenticated
  using (
    public.is_vendor_member(referrer_id)
    or (referred_id is not null and public.is_vendor_member(referred_id))
  );

create policy "vendor_referrals member insert"
  on public.vendor_referrals for insert to authenticated
  with check (public.is_vendor_member(referrer_id));

create policy "vendor_referrals member delete pending"
  on public.vendor_referrals for delete to authenticated
  using (
    public.is_vendor_member(referrer_id)
    and status = 'pending'
  );

create trigger vendor_referrals_updated
  before update on public.vendor_referrals
  for each row execute function public.tg_set_updated_at();

-- Public lookup of a referral by code so the signup page can hydrate
-- "you were invited by {referrer}" copy.
create or replace function public.get_referral_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref public.vendor_referrals;
  v_referrer_name text;
begin
  select * into v_ref from public.vendor_referrals where referral_code = p_code;
  if v_ref.id is null then
    return null;
  end if;

  select business_name into v_referrer_name
  from public.vendor_profiles where id = v_ref.referrer_id;

  return jsonb_build_object(
    'id', v_ref.id,
    'referrer_name', v_referrer_name,
    'reward_percent_off', v_ref.reward_percent_off,
    'expires_at', v_ref.expires_at,
    'status', v_ref.status
  );
end$$;

grant execute on function public.get_referral_by_code(text) to anon, authenticated;

-- Mark a referral as 'signed_up' when the invitee creates a vendor
-- profile. Called by the frontend after vendor profile creation if the
-- signup URL had ?ref=<code>.
create or replace function public.claim_vendor_referral(
  p_code text,
  p_new_vendor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref public.vendor_referrals;
  v_user_email text;
  v_caller_owns_vendor boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Caller must own the new vendor_profile they're claiming for
  select exists (
    select 1 from public.vendor_team_members
    where vendor_id = p_new_vendor_id
      and user_id = auth.uid()
      and role = 'owner'
  ) into v_caller_owns_vendor;
  if not v_caller_owns_vendor then
    return jsonb_build_object('ok', false, 'error', 'not_vendor_owner');
  end if;

  select * into v_ref from public.vendor_referrals where referral_code = p_code;
  if v_ref.id is null then
    return jsonb_build_object('ok', false, 'error', 'referral_not_found');
  end if;
  if v_ref.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_ref.referred_id is not null then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  if v_ref.referrer_id = p_new_vendor_id then
    return jsonb_build_object('ok', false, 'error', 'self_referral');
  end if;

  -- Best-effort email check
  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is not null
     and lower(v_user_email) <> lower(v_ref.email) then
    -- Allow it anyway — emails commonly differ from the invite email.
    -- Just log via no-op. (We could tighten this in v2.)
    null;
  end if;

  update public.vendor_referrals
  set referred_id = p_new_vendor_id,
      status = 'signed_up',
      signed_up_at = now()
  where id = v_ref.id;

  return jsonb_build_object('ok', true, 'referral_id', v_ref.id);
end$$;

grant execute on function public.claim_vendor_referral(text, uuid) to authenticated;
