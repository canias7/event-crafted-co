-- Lock down platform-role assignment.
--
-- Before this migration, two flaws made it trivial for any signed-up
-- user to elevate themselves to vendor (or admin):
--
--   1. handle_new_user() trusted raw_user_meta_data->>'role'. Anyone
--      with the public anon key (literally everyone — it's in every
--      browser bundle) could call:
--          supabase.auth.signUp({ options: { data: { role: 'vendor' } } })
--      and the trigger would happily insert profiles.role = 'vendor',
--      bypassing the /vendor-apply hand-review flow entirely.
--
--   2. The "profiles update own" RLS policy is a blanket
--          using (auth.uid() = id)
--      with no column restrictions, so even after we lock down the
--      trigger, a user can still
--          supabase.from('profiles').update({ role: 'vendor' })
--      from the client to escalate themselves post-signup.
--
-- This migration closes both:
--   * handle_new_user always sets role = 'host'. Display name is still
--     read from metadata (cosmetic, not a security boundary).
--   * A BEFORE UPDATE trigger on profiles silently reverts any
--     role change initiated directly by an authenticated user. Role
--     changes are only allowed when initiated by another trigger
--     (pg_trigger_depth() > 1) — i.e. the vendor-bump trigger below —
--     or by the service_role key (server-side admin tooling).
--   * A new AFTER INSERT trigger on vendor_profiles flips
--     profiles.role to 'vendor' for the inserter. The existing
--     "vendor_profiles insert own" RLS policy enforces
--     auth.uid() = user_id on that insert, so only the user
--     themselves can trigger their own role bump. The vendor_profiles
--     row's application_status remains the public-visibility gate
--     (still 'pending' until an admin reviews).

-- 1. Stop trusting user metadata for role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'host',
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

-- 2. Block end-user-initiated role changes.
create or replace function public.tg_profiles_lock_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- pg_trigger_depth() > 1 = we're nested inside another trigger
    -- (e.g. the vendor-bump trigger). auth.role() = 'service_role'
    -- = a server-side admin call. Anything else is a client UPDATE
    -- by an authenticated user, which we silently revert.
    if pg_trigger_depth() <= 1 and coalesce(auth.role(), '') <> 'service_role' then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_lock_role on public.profiles;
create trigger profiles_lock_role
  before update on public.profiles
  for each row execute function public.tg_profiles_lock_role();

-- 3. Legitimate vendor onboarding path. /vendor-apply inserts a
-- vendor_profiles row (RLS enforces auth.uid() = user_id), and that
-- insert flips the user's profile role to 'vendor'. The application
-- still requires admin approval (vendor_profiles.application_status)
-- before the listing is publicly visible.
create or replace function public.tg_vendor_profiles_bump_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
    set role = 'vendor'
    where id = new.user_id and role = 'host';
  return new;
end;
$$;

drop trigger if exists vendor_profiles_bump_role on public.vendor_profiles;
create trigger vendor_profiles_bump_role
  after insert on public.vendor_profiles
  for each row execute function public.tg_vendor_profiles_bump_role();
