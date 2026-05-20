-- Password-protected gallery shares + secure resolver.
--
-- Round 2 shipped public token-based shares but the SELECT policy
-- on vendor_gallery_shares was open to anon — meaning the
-- password_hash (if we added one) would be readable by anyone who
-- could guess any token. Two-part rewrite:
--
-- 1. Tighten SELECT: owner-only. The public route no longer reads
--    the table directly.
-- 2. Two RPCs that mediate access:
--    • create_gallery_share — server-side hash via pgcrypto's
--      bcrypt, ownership + role check.
--    • resolve_gallery_share — public-callable (anon + auth);
--      returns share metadata if no password OR password matches.
--      If password is required but missing/wrong, raises a
--      machine-readable exception the client can map to a prompt.
--      Never returns the password_hash.
--
-- pgcrypto is already enabled (used elsewhere); using crypt() +
-- gen_salt('bf') gives standard bcrypt hashes.

alter table public.vendor_gallery_shares
  add column if not exists password_hash text;

drop policy if exists "vendor_gallery_shares public read" on public.vendor_gallery_shares;
create policy "vendor_gallery_shares owner read"
  on public.vendor_gallery_shares for select
  using (user_id = (select auth.uid()));

create or replace function public.create_gallery_share(
  p_image_id uuid default null,
  p_album_id uuid default null,
  p_expires_at timestamptz default null,
  p_password text default null
)
returns text
language plpgsql
security invoker
set search_path to 'public', 'extensions'
as $$
declare
  v_token text;
  v_hash text := null;
begin
  if (p_image_id is null) = (p_album_id is null) then
    raise exception 'exactly_one_target_required';
  end if;

  if not exists (
    select 1 from public.profiles
     where id = (select auth.uid()) and role = 'vendor'
  ) then
    raise exception 'not_authorized';
  end if;

  if p_image_id is not null and not exists (
    select 1 from public.vendor_gallery_images
     where id = p_image_id and user_id = (select auth.uid())
  ) then
    raise exception 'not_authorized';
  end if;
  if p_album_id is not null and not exists (
    select 1 from public.vendor_gallery_albums
     where id = p_album_id and user_id = (select auth.uid())
  ) then
    raise exception 'not_authorized';
  end if;

  if p_password is not null and length(p_password) > 0 then
    v_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  end if;

  insert into public.vendor_gallery_shares (
    user_id, image_id, album_id, expires_at, password_hash
  ) values (
    (select auth.uid()), p_image_id, p_album_id, p_expires_at, v_hash
  )
  returning token into v_token;

  return v_token;
end;
$$;

grant execute on function public.create_gallery_share(uuid, uuid, timestamptz, text) to authenticated;

-- Returns share metadata (without the password hash) if the caller
-- is allowed to see it.
-- Exceptions:
--   'not_found'        — no row with that token, or row was deleted
--   'expired'          — share is past its expires_at
--   'needs_password'   — share is password-protected, no/empty password passed
--   'bad_password'     — share is password-protected, password didn't match
create or replace function public.resolve_gallery_share(
  p_token text,
  p_password text default null
)
returns table (
  id uuid,
  image_id uuid,
  album_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_share record;
begin
  select * into v_share from public.vendor_gallery_shares
   where token = p_token;
  if v_share.id is null then
    raise exception 'not_found';
  end if;

  if v_share.expires_at is not null
     and v_share.expires_at < now() then
    raise exception 'expired';
  end if;

  if v_share.password_hash is not null then
    if p_password is null or length(p_password) = 0 then
      raise exception 'needs_password';
    end if;
    if extensions.crypt(p_password, v_share.password_hash) <> v_share.password_hash then
      raise exception 'bad_password';
    end if;
  end if;

  id := v_share.id;
  image_id := v_share.image_id;
  album_id := v_share.album_id;
  expires_at := v_share.expires_at;
  return next;
end;
$$;

grant execute on function public.resolve_gallery_share(text, text) to anon, authenticated;
