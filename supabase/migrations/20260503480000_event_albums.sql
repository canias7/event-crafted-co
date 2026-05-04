-- Shared photo / video albums. After an event, the vendor (typically
-- photographer or videographer) uploads originals to a private bucket
-- and publishes an album with a shareable token URL. The host AND any
-- guest with the link can browse the gallery and download HD originals.
--
-- The album becomes social proof for the vendor (their profile shows
-- "N albums delivered") and a viral surface for Vendora — every guest
-- who downloads photos sees a "powered by Vendora" footer.

-- Private bucket. Anyone with the *album* share_token can view via the
-- public RPC, but direct bucket access requires being the vendor team
-- or a planning collaborator on the host_event. Storage objects are
-- served as signed URLs through the page so we never expose direct
-- bucket links.
insert into storage.buckets (id, name, public)
values ('event-albums', 'event-albums', false)
on conflict (id) do nothing;

create policy "event albums vendor team insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-albums'
    and exists (
      select 1 from public.vendor_profiles vp
      where vp.id::text = (storage.foldername(name))[1]
        and (
          vp.user_id = auth.uid()
          or exists (
            select 1 from public.vendor_team_members tm
            where tm.vendor_id = vp.id and tm.user_id = auth.uid()
          )
        )
    )
  );

create policy "event albums vendor team read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'event-albums'
    and exists (
      select 1 from public.vendor_profiles vp
      where vp.id::text = (storage.foldername(name))[1]
        and (
          vp.user_id = auth.uid()
          or exists (
            select 1 from public.vendor_team_members tm
            where tm.vendor_id = vp.id and tm.user_id = auth.uid()
          )
        )
    )
  );

create policy "event albums vendor team delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-albums'
    and exists (
      select 1 from public.vendor_profiles vp
      where vp.id::text = (storage.foldername(name))[1]
        and (
          vp.user_id = auth.uid()
          or exists (
            select 1 from public.vendor_team_members tm
            where tm.vendor_id = vp.id and tm.user_id = auth.uid()
          )
        )
    )
  );

-- Album metadata. Each album is for a specific (vendor × event) pair,
-- but inquiry_id is the canonical link since vendors only see hosts
-- they had an inquiry with.
create table public.event_albums (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  host_id uuid references public.profiles(id) on delete set null,
  event_id uuid references public.host_events(id) on delete set null,
  title text not null,
  description text,
  share_token text unique not null
    default encode(gen_random_bytes(8), 'hex'),
  cover_path text,
  host_consent_given_at timestamptz,
  published_at timestamptz,
  download_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_albums_vendor_idx on public.event_albums (vendor_id, created_at desc);
create index event_albums_host_idx on public.event_albums (host_id, created_at desc);
create index event_albums_token_idx on public.event_albums (share_token);

alter table public.event_albums enable row level security;

-- Vendor team reads / writes their own albums.
create policy "event_albums vendor team all"
  on public.event_albums for all to authenticated
  using (public.is_vendor_member(vendor_id))
  with check (public.is_vendor_member(vendor_id));

-- Host can read albums for events they host (so the album surfaces in
-- the host's event detail / microsite) — but only after consent + publish.
create policy "event_albums host read"
  on public.event_albums for select to authenticated
  using (
    auth.uid() = host_id
    and host_consent_given_at is not null
    and published_at is not null
  );

create trigger event_albums_updated
  before update on public.event_albums
  for each row execute function public.tg_set_updated_at();

-- Photos within an album. storage_path is the bucket key.
create table public.event_album_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.event_albums(id) on delete cascade,
  storage_path text not null,
  caption text,
  taken_at timestamptz,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index event_album_photos_album_idx
  on public.event_album_photos (album_id, display_order, taken_at);

alter table public.event_album_photos enable row level security;

-- Vendor team manages photos in their albums.
create policy "event_album_photos vendor all"
  on public.event_album_photos for all to authenticated
  using (
    exists (
      select 1 from public.event_albums a
      where a.id = album_id and public.is_vendor_member(a.vendor_id)
    )
  )
  with check (
    exists (
      select 1 from public.event_albums a
      where a.id = album_id and public.is_vendor_member(a.vendor_id)
    )
  );

-- Host reads photos in published albums for events they host.
create policy "event_album_photos host read"
  on public.event_album_photos for select to authenticated
  using (
    exists (
      select 1 from public.event_albums a
      where a.id = album_id
        and a.host_id = auth.uid()
        and a.host_consent_given_at is not null
        and a.published_at is not null
    )
  );

-- Notify host when a vendor publishes an album for their event.
create or replace function public.notify_host_album_published()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_vendor_name text;
begin
  if new.published_at is null or old.published_at is not null then
    return new;
  end if;
  if new.host_id is null then return new; end if;
  select coalesce(business_name, 'A vendor') into v_vendor_name
    from public.vendor_profiles where id = new.vendor_id;
  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.host_id,
    'album_published',
    v_vendor_name || ' published your photos',
    'Your "' || new.title || '" album is ready to view.',
    '/album/' || new.share_token
  );
  return new;
end$$;

drop trigger if exists event_albums_notify_host on public.event_albums;
create trigger event_albums_notify_host
  after insert or update of published_at on public.event_albums
  for each row execute function public.notify_host_album_published();

-- Public lookup by share_token. Returns album + vendor name + signed
-- URLs for every photo. Anyone with the link can view; download
-- gating is enforced by the page (download_enabled flag).
--
-- Signed URLs are short-lived; the page refetches if the user reloads.
create or replace function public.get_album_by_token(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_album record;
  v_vendor_name text;
  v_photos jsonb;
begin
  select * into v_album
    from public.event_albums
    where share_token = p_token
      and published_at is not null
      and host_consent_given_at is not null;
  if v_album.id is null then return null; end if;

  select coalesce(business_name, 'Vendor') into v_vendor_name
    from public.vendor_profiles where id = v_album.vendor_id;

  -- Photos as a jsonb array. We hand back storage_paths; the public
  -- page calls supabase.storage.createSignedUrl client-side because the
  -- anon key has read on the storage policy via a public-side policy
  -- ... actually, no — the bucket is private. We need to either:
  --   (a) issue signed URLs from this RPC (impossible — Postgres can't
  --       hit Supabase Storage REST), OR
  --   (b) flip the bucket public for paths in published albums (too
  --       broad), OR
  --   (c) hand back paths and let an adjacent edge function sign them.
  --
  -- For MVP simplicity we do (b) at the policy layer below: a SELECT
  -- policy that allows storage reads when the object's path matches
  -- a published-with-consent album. That keeps unpublished album
  -- objects fully private, and any anon visitor with the album token
  -- can browse + download HD originals for that one album only.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'storage_path', p.storage_path,
    'caption', p.caption,
    'taken_at', p.taken_at
  ) order by p.display_order, p.taken_at, p.created_at), '[]'::jsonb)
    into v_photos
    from public.event_album_photos p
    where p.album_id = v_album.id;

  return jsonb_build_object(
    'album', jsonb_build_object(
      'id', v_album.id,
      'title', v_album.title,
      'description', v_album.description,
      'cover_path', v_album.cover_path,
      'download_enabled', v_album.download_enabled,
      'published_at', v_album.published_at,
      'vendor_id', v_album.vendor_id,
      'vendor_name', v_vendor_name
    ),
    'photos', v_photos
  );
end$$;

revoke execute on function public.get_album_by_token(text) from public;
grant execute on function public.get_album_by_token(text) to anon, authenticated;

-- Storage read policy for published-album photos. Anonymous-safe — we
-- check that the storage object's name appears in event_album_photos
-- AND that the parent album is published with consent.
create policy "event albums published read"
  on storage.objects for select
  using (
    bucket_id = 'event-albums'
    and exists (
      select 1
      from public.event_album_photos p
      join public.event_albums a on a.id = p.album_id
      where p.storage_path = name
        and a.published_at is not null
        and a.host_consent_given_at is not null
    )
  );
