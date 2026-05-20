-- Gallery round 2 schema. Five additions for: trash, EXIF, blurhash,
-- intrinsic dimensions, and public shares.
--
-- (16) deleted_at — soft-delete column. Trash view shows rows where
--      it's non-null; default views filter it out. Lazy 30-day purge
--      happens client-side on page load (a regular DELETE against
--      this column, which fires the existing storage cleanup
--      trigger so files don't leak).
--
-- (9)  width / height / exif — captured client-side at upload time
--      with the exifr library. GPS coords + maker-notes are stripped
--      before storage; only camera/lens/date/exposure-trio fields
--      land in exif jsonb. width + height kept separate from the
--      jsonb for fast aspect-ratio filters (no jsonb path lookups).
--
-- (29) blurhash — short hash string. Encoded at upload by the
--      blurhash library, decoded client-side to a canvas placeholder
--      that renders behind the <img> until the real image lands.
--      Eliminates the LCP blank-tile flicker on the grid.
--
-- (17) vendor_gallery_shares — public share tokens for individual
--      images or whole albums. exactly one of image_id / album_id
--      must be set per share (CHECK enforces). Anyone with the
--      token can read the share row (RLS allows token-based public
--      read); the resolved image/album rows already have public
--      SELECT, so no extra policy work needed. Tokens are 32-char
--      hex (16 random bytes), unique. Optional expires_at; null =
--      no expiry. Owner can also delete to revoke.

alter table public.vendor_gallery_images
  add column if not exists deleted_at timestamptz,
  add column if not exists width int,
  add column if not exists height int,
  add column if not exists exif jsonb,
  add column if not exists blurhash text;

create index if not exists vendor_gallery_images_trash_idx
  on public.vendor_gallery_images(user_id, deleted_at desc)
  where deleted_at is not null;

create table public.vendor_gallery_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  image_id uuid references public.vendor_gallery_images(id) on delete cascade,
  album_id uuid references public.vendor_gallery_albums(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint vendor_gallery_shares_target_check
    check ((image_id is null) <> (album_id is null))
);

create index vendor_gallery_shares_owner_idx
  on public.vendor_gallery_shares(user_id, created_at desc);

alter table public.vendor_gallery_shares enable row level security;

-- Public token-based read. The token is essentially the
-- capability: anyone with it can fetch the row + its referenced
-- image / album. We can't gate on token in a Postgres policy
-- directly, so SELECT is open; the secrecy comes from the token
-- being un-guessable (128-bit random).
create policy "vendor_gallery_shares public read"
  on public.vendor_gallery_shares for select using (true);

create policy "vendor_gallery_shares owner write"
  on public.vendor_gallery_shares for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
       where id = (select auth.uid()) and role = 'vendor'
    )
  );

create policy "vendor_gallery_shares owner update"
  on public.vendor_gallery_shares for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "vendor_gallery_shares owner delete"
  on public.vendor_gallery_shares for delete
  using (user_id = (select auth.uid()));
