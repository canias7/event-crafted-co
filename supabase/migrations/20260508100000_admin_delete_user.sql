-- Admin "Delete account" — irreversibly remove a user. Cascades through
-- profiles → vendor_profiles → vendor child tables (listings, portfolio,
-- inquiries, etc.) via the existing FK CASCADE chain. Frees up the email
-- so the same address can sign up again from scratch.
--
-- The role dropdown has been removed from the admin UI (multi-role makes
-- it irrelevant — vendor capability now lives in vendor_profiles, and
-- profiles.role is locked to 'admin' vs 'host' anyway). No SQL change
-- needed for that — tg_profiles_lock_role already prevents arbitrary
-- changes outside admin promotion paths we'd add separately.

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_role text;
begin
  if v_caller is null then
    raise exception 'must be authenticated';
  end if;

  -- Caller must be an admin. Re-check inline rather than relying on
  -- is_admin() so we get an explicit exception instead of a silent
  -- no-op.
  select role into v_caller_role
    from public.profiles
   where id = v_caller;
  if v_caller_role is distinct from 'admin' then
    raise exception 'only admins can delete accounts';
  end if;

  -- Don't let an admin delete themselves — too easy to lose access.
  if p_user_id = v_caller then
    raise exception 'admins cannot delete their own account from this page';
  end if;

  -- Delete the auth.users row directly. Every downstream FK cascades:
  --   auth.users → public.profiles (CASCADE)
  --   public.profiles → public.vendor_profiles (CASCADE)
  --   public.vendor_profiles → all vendor_* child tables (CASCADE)
  --   plus host-side data: inquiries, mood_boards, saved_searches, etc.
  delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;
