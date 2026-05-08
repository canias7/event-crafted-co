-- Multi-role: a single auth user can simultaneously be a host AND a vendor.
-- Previously, applying to be a vendor banned the auth user until admin
-- approval, blocking them from using host features at all. We collapse that:
-- everyone is a host by default, and "vendor" is determined by the
-- existence of an approved vendor_profile row — not by profiles.role.
--
-- profiles.role is kept only to distinguish admins; everyone else stays
-- 'host' regardless of whether they're also an approved vendor.

-- 1. is_approved_vendor(): canonical check used by the apps in place of
--    profile.role === 'vendor'. SECURITY DEFINER so it can read the
--    vendor_profiles row even when the caller's RLS would hide it.
create or replace function public.is_approved_vendor(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.vendor_profiles
    where user_id = p_user_id
      and application_status = 'approved'
  );
$$;

grant execute on function public.is_approved_vendor(uuid) to authenticated, anon;

-- 2. Backfill: free anyone whose only reason for being banned was a
--    pending/rejected vendor application. Users who are explicitly
--    suspended (profiles.suspended_at is not null) stay banned.
update auth.users u
   set banned_until = null
 where u.banned_until is not null
   and not exists (
     select 1 from public.profiles p
     where p.id = u.id and p.suspended_at is not null
   );

-- 3. handle_new_user: stop banning new vendor applicants. Profiles still
--    default to role='host'; the vendor_profile row (when present) carries
--    the approval state.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_business text := new.raw_user_meta_data->>'vendor_business_name';
  v_category text := new.raw_user_meta_data->>'vendor_category';
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'host',
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  if v_business is not null and v_category is not null then
    insert into public.vendor_profiles (user_id, business_name, category, application_status)
    values (new.id, v_business, v_category, 'pending');
  end if;

  return new;
end;
$$;

-- 4. tg_vendor_profiles_role_promote: no-op now. Approval state lives in
--    vendor_profiles.application_status; we no longer mutate profiles.role
--    or auth.users.banned_until based on vendor decisions.
create or replace function public.tg_vendor_profiles_role_promote()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return new;
end;
$$;

-- 5. tg_profiles_suspend_mirror: simplify. Explicit profile suspension is
--    the only thing that touches banned_until. The previous "is there a
--    pending vendor_profile?" check is gone because pending vendors are
--    no longer banned at all.
create or replace function public.tg_profiles_suspend_mirror()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.suspended_at is distinct from old.suspended_at then
    if new.suspended_at is not null then
      update auth.users
         set banned_until = '9999-12-31 00:00:00+00'::timestamptz
       where id = new.id;
    else
      update auth.users set banned_until = null where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

-- 6. apply_as_vendor RPC: lets a logged-in host create their own pending
--    vendor application without going through the email signup flow. Used
--    by the new "Apply to be a vendor" CTA in the host dashboard.
create or replace function public.apply_as_vendor(
  p_business_name text,
  p_category text
)
returns public.vendor_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.vendor_profiles;
  v_new public.vendor_profiles;
begin
  if v_user_id is null then
    raise exception 'must be authenticated';
  end if;

  if coalesce(trim(p_business_name), '') = '' then
    raise exception 'business_name required';
  end if;
  if coalesce(trim(p_category), '') = '' then
    raise exception 'category required';
  end if;

  -- If this user already has a vendor_profile, return it as-is. Approved
  -- and pending applications are both treated as "already applied".
  select * into v_existing
    from public.vendor_profiles
   where user_id = v_user_id
   limit 1;
  if found then
    return v_existing;
  end if;

  insert into public.vendor_profiles (
    user_id, business_name, category, application_status
  ) values (
    v_user_id, trim(p_business_name), trim(p_category), 'pending'
  )
  returning * into v_new;

  return v_new;
end;
$$;

grant execute on function public.apply_as_vendor(text, text) to authenticated;
