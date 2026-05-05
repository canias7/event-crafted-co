-- Three additions in one migration:
-- 1. event_channels — Slack-for-your-event chat scoped to a host's
--    event. Members are the host, planning collaborators, and any
--    booked vendor (one channel per event).
-- 2. editorial_articles.vendor_id — let vendors author blog posts
--    that surface under their profile + on the public /guides/ index.
-- 3. vendor_bundles — multi-vendor packages (photographer +
--    videographer combo, etc.).

-- ─── #2 Group channels ──────────────────────────────────────────

create table public.event_channels (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  -- Default name; admins can rename. We auto-create one channel per
  -- host on first message; future expansion: per-vendor sub-channels.
  name text not null default 'Planning team',
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index event_channels_host_idx on public.event_channels (host_id);

create table public.event_channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.event_channels(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index event_channel_messages_channel_idx
  on public.event_channel_messages (channel_id, created_at);

alter table public.event_channels enable row level security;
alter table public.event_channel_messages enable row level security;

-- Channel access: host owns; planning collaborators can read+write.
-- (We re-use is_planning_collaborator from earlier migrations.)
create policy "event_channels host all"
  on public.event_channels for all to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy "event_channels collaborator read"
  on public.event_channels for select to authenticated
  using (public.is_planning_collaborator(host_id));

create policy "event_channel_messages member read"
  on public.event_channel_messages for select to authenticated
  using (
    exists (
      select 1 from public.event_channels c
      where c.id = channel_id
        and (c.host_id = auth.uid() or public.is_planning_collaborator(c.host_id))
    )
  );

create policy "event_channel_messages member insert"
  on public.event_channel_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.event_channels c
      where c.id = channel_id
        and (c.host_id = auth.uid() or public.is_planning_collaborator(c.host_id))
    )
  );

-- ─── #3 Vendor blog (extend editorial_articles) ─────────────────

alter table public.editorial_articles
  add column if not exists vendor_id uuid
    references public.vendor_profiles(id) on delete set null;

create index if not exists editorial_articles_vendor_idx
  on public.editorial_articles (vendor_id)
  where vendor_id is not null;

-- Vendors can write/edit their own posts. Public read still gated
-- by published_at; admin can do anything.
create policy "editorial_articles vendor write own"
  on public.editorial_articles for all to authenticated
  using (
    vendor_id is not null
    and exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  )
  with check (
    vendor_id is not null
    and exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

-- ─── #7 Vendor bundles ───────────────────────────────────────────

create table public.vendor_bundles (
  id uuid primary key default gen_random_uuid(),
  -- The vendor that "owns" the bundle (typically the lead vendor —
  -- the one who fielded the inquiry and assembled partners).
  primary_vendor_id uuid not null
    references public.vendor_profiles(id) on delete cascade,
  name text not null,
  description text,
  -- Combined price; not the sum of individual member packages.
  -- Vendors usually discount when bundling.
  price_cents integer check (price_cents is null or price_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendor_bundles_primary_idx
  on public.vendor_bundles (primary_vendor_id, is_active);

create table public.vendor_bundle_members (
  bundle_id uuid not null references public.vendor_bundles(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  role text,
  display_order int not null default 0,
  primary key (bundle_id, vendor_id)
);

alter table public.vendor_bundles enable row level security;
alter table public.vendor_bundle_members enable row level security;

create policy "vendor_bundles public read"
  on public.vendor_bundles for select using (is_active = true);

create policy "vendor_bundles owner write"
  on public.vendor_bundles for all to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = primary_vendor_id and vp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = primary_vendor_id and vp.user_id = auth.uid()
    )
  );

create policy "vendor_bundle_members public read"
  on public.vendor_bundle_members for select using (true);

create policy "vendor_bundle_members owner write"
  on public.vendor_bundle_members for all to authenticated
  using (
    exists (
      select 1 from public.vendor_bundles vb
      join public.vendor_profiles vp on vp.id = vb.primary_vendor_id
      where vb.id = bundle_id and vp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vendor_bundles vb
      join public.vendor_profiles vp on vp.id = vb.primary_vendor_id
      where vb.id = bundle_id and vp.user_id = auth.uid()
    )
  );

create trigger vendor_bundles_updated
  before update on public.vendor_bundles
  for each row execute function public.tg_set_updated_at();
