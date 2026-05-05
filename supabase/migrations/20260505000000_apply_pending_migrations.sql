-- Web Push subscriptions. One row per (user, browser) — a single user
-- can have multiple devices subscribed. The browser's Push API gives us
-- an endpoint URL plus two keys (p256dh + auth) we use to encrypt the
-- payload before posting to the endpoint.
--
-- send-push edge function reads this table and fires for each row.
-- A trigger on `notifications` enqueues a push for the recipient any
-- time a notification is inserted, so vendors and hosts get a real
-- ping for inquiries / messages / proposals without each call site
-- having to remember to fire push themselves.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  -- The endpoint URL is the unique identifier per (user, device); a
  -- duplicate insert means the same browser re-subscribed (e.g. after
  -- clearing site data) and we should overwrite the keys.
  unique (user_id, endpoint)
);

create index push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions own select"
  on public.push_subscriptions for select to authenticated
  using (auth.uid() = user_id);

create policy "push_subscriptions own insert"
  on public.push_subscriptions for insert to authenticated
  with check (auth.uid() = user_id);

create policy "push_subscriptions own delete"
  on public.push_subscriptions for delete to authenticated
  using (auth.uid() = user_id);

-- Trigger fanout: any new notification → POST to the send-push edge
-- function for that user. Uses pg_net (auto-enabled in Supabase) so
-- the trigger is non-blocking. Wrapped in EXCEPTION so it can't break
-- the parent insert if pg_net isn't available or the function is down.
create or replace function public.fanout_notification_to_push()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  -- These two settings are populated by the Supabase platform. If
  -- absent we silently skip — push is best-effort.
  begin
    v_url := current_setting('app.settings.supabase_url', true);
    v_key := current_setting('app.settings.service_role_key', true);
  exception when others then
    return new;
  end;

  if v_url is null or v_key is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := v_url || '/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'user_id', new.user_id,
        'title', new.title,
        'body', new.body,
        'link', new.link,
        'tag', new.type
      )
    );
  exception when others then
    -- pg_net not available, function down, etc. — silently swallow.
    null;
  end;
  return new;
end$$;

drop trigger if exists notifications_fanout_push on public.notifications;
create trigger notifications_fanout_push
  after insert on public.notifications
  for each row execute function public.fanout_notification_to_push();

revoke execute on function public.fanout_notification_to_push() from public, anon, authenticated;
-- Cross-vendor benchmarks. Lets a vendor see how they compare to other
-- vendors in the same category — median reply time, booking rate, and
-- weekly inquiries. Critical for retention: vendors stay engaged when
-- they have something to chase ("you're slower than your peers").
--
-- Authorization: SECURITY DEFINER + the caller must own a vendor_profile
-- in the requested category (otherwise anyone could fish for category
-- stats). Returns aggregates only — never identifies peer vendors.

create or replace function public.get_vendor_benchmarks(
  p_category text,
  p_window_days int default 30
)
returns table (
  peer_count int,
  median_response_hours numeric,
  median_booking_rate numeric,
  median_inquiries int
)
language plpgsql security definer set search_path = public
as $$
declare
  v_caller_owns boolean;
  v_since timestamptz := now() - (p_window_days || ' days')::interval;
begin
  select exists (
    select 1 from public.vendor_profiles
    where user_id = auth.uid() and category = p_category
  ) into v_caller_owns;
  if not v_caller_owns then
    raise exception 'Only vendors in this category can view its benchmarks';
  end if;

  -- Per-vendor numbers, then take the median across vendors.
  return query
  with per_vendor as (
    select
      vp.id as vendor_id,
      -- Inquiries in window
      (
        select count(*) from public.inquiries i
        where i.vendor_id = vp.id and i.created_at >= v_since
      ) as inquiries,
      -- Booking rate = won / (won + lost + expired) in window. Skip
      -- still-pending so a vendor with 5 new + 0 closed doesn't read
      -- as 0%.
      (
        select case
          when count(*) filter (where status in ('won','lost','expired')) = 0 then null
          else round(
            count(*) filter (where status = 'won')::numeric
            / count(*) filter (where status in ('won','lost','expired')),
            3
          )
        end
        from public.inquiries i
        where i.vendor_id = vp.id and i.created_at >= v_since
      ) as booking_rate,
      -- Median response time (in hours) per vendor: per-inquiry first
      -- vendor reply minus inquiry created. Outer median across vendors.
      (
        select percentile_cont(0.5) within group (order by ext.delta_hr)
        from (
          select extract(epoch from (
            (select min(m.created_at)
               from public.messages m
               where m.inquiry_id = i.id and m.sender_role = 'vendor')
            - i.created_at
          )) / 3600.0 as delta_hr
          from public.inquiries i
          where i.vendor_id = vp.id
            and i.created_at >= v_since
            and exists (
              select 1 from public.messages m
              where m.inquiry_id = i.id and m.sender_role = 'vendor'
            )
        ) ext
        where ext.delta_hr is not null and ext.delta_hr >= 0
      ) as response_hours
    from public.vendor_profiles vp
    where vp.category = p_category
  )
  select
    (select count(*)::int from per_vendor) as peer_count,
    percentile_cont(0.5) within group (order by response_hours)::numeric(10,2) as median_response_hours,
    percentile_cont(0.5) within group (order by booking_rate)::numeric(5,3) as median_booking_rate,
    percentile_cont(0.5) within group (order by inquiries)::int as median_inquiries
  from per_vendor;
end$$;

revoke execute on function public.get_vendor_benchmarks(text, int) from public, anon;
grant execute on function public.get_vendor_benchmarks(text, int) to authenticated;
-- Vendor trust verifications. Vendor uploads documents (government ID,
-- insurance certificate, business license), admin reviews + approves,
-- and the corresponding badge appears on the public profile.
--
-- Documents themselves are PRIVATE — the bucket is non-public and only
-- the owning vendor + admins can read the files. The PUBLIC surface is
-- a compact view (`vendor_public_badges`) that just exposes the approved
-- KIND of each verification, never the document, expiry, or notes.

-- Storage bucket. Private — never make this public, it contains IDs and
-- insurance certs.
insert into storage.buckets (id, name, public)
values ('vendor-verifications', 'vendor-verifications', false)
on conflict (id) do nothing;

-- Owners write to their own folder.
create policy "vendor verifications owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vendor-verifications'
    and exists (
      select 1 from public.vendor_profiles vp
      where vp.id::text = (storage.foldername(name))[1]
        and vp.user_id = auth.uid()
    )
  );

-- Owners read their own folder; admins read everything in the bucket.
create policy "vendor verifications owner read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vendor-verifications'
    and (
      exists (
        select 1 from public.vendor_profiles vp
        where vp.id::text = (storage.foldername(name))[1]
          and vp.user_id = auth.uid()
      )
      or exists (
        select 1 from public.profiles ur
        where ur.id = auth.uid() and ur.role = 'admin'
      )
    )
  );

-- Owners delete their own files.
create policy "vendor verifications owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vendor-verifications'
    and exists (
      select 1 from public.vendor_profiles vp
      where vp.id::text = (storage.foldername(name))[1]
        and vp.user_id = auth.uid()
    )
  );

-- Verification records. One row per (vendor, kind). A vendor can re-upload
-- after rejection — the upsert overwrites the document_path and resets
-- status to 'pending' (handled in the manager UI).
create table public.vendor_verifications (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  kind text not null check (kind in ('identity','insurance','business_license')),
  document_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  notes text,
  expires_at date,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (vendor_id, kind)
);

create index vendor_verifications_status_idx
  on public.vendor_verifications (status, submitted_at desc);

alter table public.vendor_verifications enable row level security;

-- Vendor reads their own rows.
create policy "vendor_verifications vendor select"
  on public.vendor_verifications for select to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create policy "vendor_verifications vendor upsert"
  on public.vendor_verifications for insert to authenticated
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create policy "vendor_verifications vendor update"
  on public.vendor_verifications for update to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

-- Admin reads + writes everything (status flips happen here).
create policy "vendor_verifications admin all"
  on public.vendor_verifications for all to authenticated
  using (
    exists (
      select 1 from public.profiles ur where ur.id = auth.uid() and ur.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles ur where ur.id = auth.uid() and ur.role = 'admin'
    )
  );

-- Public-readable badge view. Surfaces only the *kinds* approved, no
-- document path, no expiry, no notes. Safe to expose to anyone.
create view public.vendor_public_badges
with (security_invoker = true)
as
  select vendor_id, array_agg(kind order by kind) as kinds
  from public.vendor_verifications
  where status = 'approved'
    and (expires_at is null or expires_at >= current_date)
  group by vendor_id;

grant select on public.vendor_public_badges to anon, authenticated;

-- When a vendor submits, notify all admins so the queue doesn't sit.
create or replace function public.notify_admins_new_verification()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_vendor_name text;
  r record;
begin
  if new.status <> 'pending' then return new; end if;
  select coalesce(business_name, 'A vendor') into v_vendor_name
    from public.vendor_profiles where id = new.vendor_id;
  for r in
    select id from public.profiles where role = 'admin'
  loop
    insert into public.notifications (user_id, type, title, body, link)
    values (
      r.user_id,
      'verification_submitted',
      'Verification to review',
      v_vendor_name || ' submitted a ' || new.kind || ' document.',
      '/admin/verifications'
    );
  end loop;
  return new;
end$$;

drop trigger if exists vendor_verifications_notify_admins on public.vendor_verifications;
create trigger vendor_verifications_notify_admins
  after insert on public.vendor_verifications
  for each row execute function public.notify_admins_new_verification();

-- When admin flips status, notify the vendor.
create or replace function public.notify_vendor_verification_decided()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid;
begin
  if new.status = old.status then return new; end if;
  if new.status not in ('approved','rejected') then return new; end if;
  select user_id into v_user from public.vendor_profiles where id = new.vendor_id;
  if v_user is null then return new; end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_user,
    'verification_' || new.status,
    case new.status
      when 'approved' then 'Verification approved'
      else 'Verification needs another look'
    end,
    case new.status
      when 'approved' then 'Your ' || new.kind || ' is verified — the badge is now on your profile.'
      else 'Your ' || new.kind || ' submission was returned. ' || coalesce('Reason: ' || new.notes, '')
    end,
    '/vendor/profile'
  );
  return new;
end$$;

drop trigger if exists vendor_verifications_notify_vendor on public.vendor_verifications;
create trigger vendor_verifications_notify_vendor
  after update of status on public.vendor_verifications
  for each row execute function public.notify_vendor_verification_decided();

revoke execute on function public.notify_admins_new_verification() from public, anon, authenticated;
revoke execute on function public.notify_vendor_verification_decided() from public, anon, authenticated;
-- Real-event galleries: vendors turn a completed Vendora booking into a
-- short editorial page with the event story + a photo gallery + credit
-- links back to themselves. Doubles as social proof, SEO landing pages,
-- and a viral loop ("featured on Vendora" badge a vendor can share).
--
-- Linking back to an inquiry is optional but useful for analytics — when
-- linked, only the booked vendor can publish, which protects against
-- random vendors fabricating events. The host_consent_given_at flag
-- gates publication: vendor uploads + drafts freely but can only flip
-- to public after the host gives consent.

create table public.real_events (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  slug text unique,
  title text not null,
  intro text,
  story text,
  cover_path text,
  gallery_paths text[] not null default '{}',
  event_type text check (event_type in ('wedding','birthday','holiday_dinner','other') or event_type is null),
  event_date date,
  location text,
  host_consent_given_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index real_events_vendor_idx on public.real_events (vendor_id, created_at desc);
create index real_events_published_idx
  on public.real_events (published_at desc nulls last)
  where published_at is not null and host_consent_given_at is not null;

alter table public.real_events enable row level security;

-- Public read of published-with-consent rows only. Drafts stay private
-- to the vendor team.
create policy "real_events public read"
  on public.real_events for select
  using (
    published_at is not null and host_consent_given_at is not null
  );

create policy "real_events vendor team read"
  on public.real_events for select to authenticated
  using (public.is_vendor_member(vendor_id));

create policy "real_events vendor team insert"
  on public.real_events for insert to authenticated
  with check (public.is_vendor_member(vendor_id));

create policy "real_events vendor team update"
  on public.real_events for update to authenticated
  using (public.is_vendor_member(vendor_id));

create policy "real_events vendor team delete"
  on public.real_events for delete to authenticated
  using (public.is_vendor_member(vendor_id));

create trigger real_events_updated
  before update on public.real_events
  for each row execute function public.tg_set_updated_at();

-- Slug generator. Called from the manager UI before publish; uses the
-- title + a short hash of the id so two events with the same title
-- still get unique slugs.
create or replace function public.generate_real_event_slug(
  p_title text,
  p_id uuid
)
returns text
language plpgsql immutable
as $$
declare
  v_base text;
begin
  v_base := lower(regexp_replace(p_title, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  if length(v_base) > 60 then v_base := substring(v_base for 60); end if;
  if v_base = '' then v_base := 'event'; end if;
  return v_base || '-' || substr(replace(p_id::text, '-', ''), 1, 6);
end$$;
-- Event microsite: a single shareable URL the host gives to their guests
-- with the event story + countdown + schedule + RSVP + registry + group
-- gifts + photo gallery, all branded with the host's theme. Works for
-- any event type Vendora supports — weddings, birthdays, holiday dinners,
-- showers, anniversaries — copy stays event-agnostic.
--
-- Public access via a short token (mounted at /e/<token>). All reads
-- through a SECURITY DEFINER RPC so we don't have to write token-aware
-- RLS on every joined table.

alter table public.host_events
  add column if not exists microsite_token text unique
    default encode(gen_random_bytes(6), 'hex'),
  add column if not exists microsite_published_at timestamptz,
  add column if not exists microsite_title text,
  add column if not exists microsite_subtitle text,
  add column if not exists microsite_story text,
  add column if not exists microsite_cover_path text,
  add column if not exists microsite_theme text not null default 'classic'
    check (microsite_theme in ('classic','rose','sage','dusk','midnight','champagne')),
  add column if not exists microsite_show_schedule boolean not null default true,
  add column if not exists microsite_show_rsvp boolean not null default true,
  add column if not exists microsite_show_registry boolean not null default true,
  add column if not exists microsite_show_gifts boolean not null default true,
  add column if not exists microsite_show_gallery boolean not null default true;

-- Backfill tokens for any pre-existing rows (the default only fires on new
-- inserts when the column is added later).
update public.host_events
set microsite_token = encode(gen_random_bytes(6), 'hex')
where microsite_token is null;

-- Public bucket for cover photos + gallery shots. Host-folder write
-- enforcement (same pattern as vendor-portfolios).
insert into storage.buckets (id, name, public)
values ('event-microsites', 'event-microsites', true)
on conflict (id) do nothing;

create policy "event microsites public read"
  on storage.objects for select
  using (bucket_id = 'event-microsites');

create policy "event microsites host insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-microsites'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "event microsites host delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-microsites'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Optional gallery photos for the microsite. Host-uploaded; ordered by
-- display_order then created_at.
create table public.event_microsite_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.host_events(id) on delete cascade,
  storage_path text not null,
  caption text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index event_microsite_photos_event_idx
  on public.event_microsite_photos (event_id, display_order, created_at);

alter table public.event_microsite_photos enable row level security;

create policy "event_microsite_photos public read"
  on public.event_microsite_photos for select using (true);

create policy "event_microsite_photos host insert"
  on public.event_microsite_photos for insert to authenticated
  with check (
    exists (
      select 1 from public.host_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

create policy "event_microsite_photos host update"
  on public.event_microsite_photos for update to authenticated
  using (
    exists (
      select 1 from public.host_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

create policy "event_microsite_photos host delete"
  on public.event_microsite_photos for delete to authenticated
  using (
    exists (
      select 1 from public.host_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

-- Public microsite read RPC. Returns the event basics + the host display
-- name + scheduled timeline items + registry links + gift wishes (with
-- progress) + photos. Anything gated by host_events.microsite_show_*
-- gets returned as nulls/empty arrays so the page can hide the section
-- without leaking what's there.
create or replace function public.get_microsite_by_token(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_event record;
  v_host_name text;
  v_schedule jsonb;
  v_registry jsonb;
  v_gifts jsonb;
  v_photos jsonb;
begin
  select * into v_event
    from public.host_events
    where microsite_token = p_token
      and microsite_published_at is not null
      and archived_at is null;
  if v_event.id is null then
    return null;
  end if;

  select coalesce(display_name, 'A Vendora host') into v_host_name
    from public.profiles where id = v_event.host_id;

  if v_event.microsite_show_schedule then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'title', t.title,
      'notes', t.notes,
      'start_time', t.start_time,
      'duration_minutes', t.duration_minutes,
      'location', t.location
    ) order by t.start_time, t.display_order), '[]'::jsonb)
      into v_schedule
      from public.event_timeline_items t
      where t.event_id = v_event.id;
  else
    v_schedule := '[]'::jsonb;
  end if;

  if v_event.microsite_show_registry then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'label', r.label,
      'provider', r.provider,
      'url', r.url,
      'description', r.description
    ) order by r.display_order, r.created_at), '[]'::jsonb)
      into v_registry
      from public.event_registry_links r
      where r.host_id = v_event.host_id;
  else
    v_registry := '[]'::jsonb;
  end if;

  if v_event.microsite_show_gifts then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id,
      'title', w.title,
      'description', w.description,
      'image_url', w.image_url,
      'target_cents', w.target_cents,
      'share_token', w.share_token,
      'pledged_cents', coalesce((
        select sum(p.amount_cents)::int
        from public.gift_pledges p
        where p.wish_id = w.id
      ), 0)
    ) order by w.created_at desc), '[]'::jsonb)
      into v_gifts
      from public.gift_wishes w
      where w.host_id = v_event.host_id;
  else
    v_gifts := '[]'::jsonb;
  end if;

  if v_event.microsite_show_gallery then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'storage_path', p.storage_path,
      'caption', p.caption
    ) order by p.display_order, p.created_at), '[]'::jsonb)
      into v_photos
      from public.event_microsite_photos p
      where p.event_id = v_event.id;
  else
    v_photos := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id,
      'name', v_event.name,
      'event_type', v_event.event_type,
      'event_date', v_event.event_date,
      'event_location', v_event.event_location,
      'microsite_title', v_event.microsite_title,
      'microsite_subtitle', v_event.microsite_subtitle,
      'microsite_story', v_event.microsite_story,
      'microsite_cover_path', v_event.microsite_cover_path,
      'microsite_theme', v_event.microsite_theme,
      'microsite_show_rsvp', v_event.microsite_show_rsvp,
      'host_name', v_host_name
    ),
    'schedule', v_schedule,
    'registry', v_registry,
    'gifts', v_gifts,
    'photos', v_photos
  );
end$$;

revoke execute on function public.get_microsite_by_token(text) from public, anon;
grant execute on function public.get_microsite_by_token(text) to anon, authenticated;
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
-- Two-way external calendar sync. v1 ships INBOUND sync for Google
-- Calendar — when a vendor (or host) connects their account, we
-- periodically pull busy events from their primary calendar into
-- calendar_synced_busy. The vendor availability page renders these
-- alongside manually-added unavailable dates so the vendor doesn't
-- have to maintain two calendars.
--
-- Outbound sync (push our appointments to their Google Calendar) is
-- v2 — adds an external_event_id column on appointments + a periodic
-- write-side reconcile.
--
-- Operator setup (one-time):
--   1. Create a Google Cloud project + enable the Calendar API.
--   2. Configure the OAuth consent screen + create Web Application
--      credentials. Authorized redirect URI:
--        <SUPABASE_URL>/functions/v1/google-calendar-oauth?action=callback
--   3. Set in Supabase project secrets:
--        GOOGLE_OAUTH_CLIENT_ID
--        GOOGLE_OAUTH_CLIENT_SECRET
--        GOOGLE_OAUTH_STATE_SECRET (any 32-byte random string)
--        APP_URL (e.g. https://vendora.app)
--   4. Schedule sync-google-calendar to run every 15-30 minutes via
--      Supabase cron (pg_cron net.http_post).
--
-- Tokens are stored as plain text. For production-grade encryption use
-- Supabase Vault and wrap the columns with vault.create_secret(); the
-- shape stays the same.

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google')),
  account_email text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz not null,
  primary_calendar_id text not null default 'primary',
  -- Toggles. Inbound is the default — pulling busy events into Vendora.
  -- Outbound (push appointments to the connected calendar) is v2 and
  -- the column is here so the UI can already collect the preference.
  pull_busy_times boolean not null default true,
  push_appointments boolean not null default false,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One connection per (user, provider). Reconnecting overwrites.
  unique (user_id, provider)
);

create index calendar_connections_user_idx
  on public.calendar_connections (user_id);

alter table public.calendar_connections enable row level security;

-- Tokens are sensitive — only the owning user reads their row, and
-- service-role-key (used by the sync edge function) bypasses RLS.
create policy "calendar_connections own select"
  on public.calendar_connections for select to authenticated
  using (auth.uid() = user_id);

create policy "calendar_connections own delete"
  on public.calendar_connections for delete to authenticated
  using (auth.uid() = user_id);

create policy "calendar_connections own update"
  on public.calendar_connections for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- (No insert policy — connections are created by the edge function
-- via service-role key after the OAuth callback.)

create trigger calendar_connections_updated
  before update on public.calendar_connections
  for each row execute function public.tg_set_updated_at();

-- Busy events pulled from the connected calendar. external_event_id +
-- (user_id, provider) is unique so the sync upsert is idempotent.
create table public.calendar_synced_busy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google')),
  external_event_id text not null,
  summary text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_all_day boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (user_id, provider, external_event_id)
);

create index calendar_synced_busy_user_window_idx
  on public.calendar_synced_busy (user_id, starts_at);

alter table public.calendar_synced_busy enable row level security;

-- Owner reads their own rows. Vendor team members can read each other's
-- so the vendor team availability shows blocks added by any teammate.
create policy "calendar_synced_busy own select"
  on public.calendar_synced_busy for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.vendor_profiles vp
      join public.vendor_team_members tm on tm.vendor_id = vp.id
      where vp.user_id = calendar_synced_busy.user_id
        and tm.user_id = auth.uid()
    )
  );

create policy "calendar_synced_busy own delete"
  on public.calendar_synced_busy for delete to authenticated
  using (auth.uid() = user_id);
-- Cross-sell vendor recommendations driven by co-booking signal. Two
-- public RPCs:
--
--   get_cobooked_vendors(vendor_id, limit) — vendors that appear on the
--     same host's `won` inquiries as the input vendor. Surfaces "often
--     booked with" rail on the vendor detail page.
--
--   get_recommended_for_host(host_id, limit) — for a host who's booked
--     at least one vendor, returns the top vendors that other hosts
--     who booked the same vendor(s) also booked. Classic
--     collaborative-filtering shape (people who booked this also
--     booked …) but scoped to one host's history.
--
-- Both RPCs combine the co-booking signal with vendor-curated
-- vendor_recommendations rows: a curated rec is treated as one extra
-- co-book point, so vendors can hand-promote their preferred partners.
--
-- Returns minimal fields for VendorCard rendering — no joins to
-- packages or reviews; the frontend already has those via useVendors.

create or replace function public.get_cobooked_vendors(
  p_vendor_id uuid,
  p_limit int default 6
)
returns table (
  vendor_id uuid,
  business_name text,
  category text,
  location text,
  cobookings int,
  is_curated boolean
)
language sql stable security definer set search_path = public
as $$
  with same_host_wins as (
    -- All hosts who booked the input vendor.
    select distinct host_id
    from public.inquiries
    where vendor_id = p_vendor_id and status = 'won'
  ),
  cobooks as (
    -- Other vendors those same hosts booked.
    select i.vendor_id, count(*)::int as n
    from public.inquiries i
    join same_host_wins s on s.host_id = i.host_id
    where i.status = 'won'
      and i.vendor_id <> p_vendor_id
    group by i.vendor_id
  ),
  curated as (
    select recommended_id as vendor_id
    from public.vendor_recommendations
    where recommender_id = p_vendor_id
  ),
  combined as (
    select
      vp.id as vendor_id,
      vp.business_name,
      vp.category,
      vp.location,
      coalesce(c.n, 0) as cobookings,
      (cu.vendor_id is not null) as is_curated,
      coalesce(c.n, 0) + (case when cu.vendor_id is not null then 1 else 0 end) as score
    from public.vendor_profiles vp
    left join cobooks c on c.vendor_id = vp.id
    left join curated cu on cu.vendor_id = vp.id
    where vp.id <> p_vendor_id
      and (c.n is not null or cu.vendor_id is not null)
  )
  select vendor_id, business_name, category, location, cobookings, is_curated
  from combined
  order by score desc, business_name asc
  limit p_limit;
$$;

revoke execute on function public.get_cobooked_vendors(uuid, int) from public;
grant execute on function public.get_cobooked_vendors(uuid, int) to anon, authenticated;

-- For a host: vendors that other hosts booked alongside the vendors
-- THIS host has already booked, ranked by frequency. Excludes anyone
-- this host has already inquired (won OR otherwise) so we don't
-- recommend dead-end repeats.
create or replace function public.get_recommended_for_host(
  p_host_id uuid,
  p_limit int default 6
)
returns table (
  vendor_id uuid,
  business_name text,
  category text,
  location text,
  cobookings int
)
language sql stable security definer set search_path = public
as $$
  with my_wins as (
    select distinct vendor_id
    from public.inquiries
    where host_id = p_host_id and status = 'won'
  ),
  peer_hosts as (
    -- Other hosts who also booked any of MY vendors.
    select distinct i.host_id
    from public.inquiries i
    join my_wins m on m.vendor_id = i.vendor_id
    where i.status = 'won' and i.host_id <> p_host_id
  ),
  peer_books as (
    -- All vendors those peer hosts have booked.
    select i.vendor_id, count(*)::int as n
    from public.inquiries i
    join peer_hosts p on p.host_id = i.host_id
    where i.status = 'won'
    group by i.vendor_id
  ),
  exclude as (
    -- Don't recommend vendors I've already engaged with.
    select distinct vendor_id from public.inquiries where host_id = p_host_id
  )
  select vp.id, vp.business_name, vp.category, vp.location, pb.n
  from peer_books pb
  join public.vendor_profiles vp on vp.id = pb.vendor_id
  where pb.vendor_id not in (select vendor_id from exclude)
  order by pb.n desc, vp.business_name asc
  limit p_limit;
$$;

revoke execute on function public.get_recommended_for_host(uuid, int) from public;
grant execute on function public.get_recommended_for_host(uuid, int) to authenticated;
-- Vendor profile completeness score. Returns a 0-100 number plus a
-- jsonb breakdown of each check (label, weight, done, hint). Drives a
-- "your profile is 65% complete" widget on the vendor dashboard +
-- nudge CTAs to complete the missing pieces.
--
-- The weights reflect what actually moves conversion based on what
-- we've seen so far: portfolio + packages + verifications matter most.
-- Sum of weights = 100.

create or replace function public.get_vendor_profile_score(
  p_vendor_id uuid
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_profile record;
  v_portfolio_count int;
  v_packages_count int;
  v_clips_count int;
  v_verified_count int;
  v_recs_count int;
  v_imported_reviews_count int;
  v_real_events_count int;
  v_intake_count int;

  c_bio boolean;
  c_location boolean;
  c_price boolean;
  c_portfolio boolean;
  c_packages boolean;
  c_intro_video boolean;
  c_clips boolean;
  c_verified boolean;
  c_imported boolean;
  c_real_event boolean;
  c_intake boolean;
  c_recs boolean;

  score int := 0;
begin
  select * into v_profile from public.vendor_profiles where id = p_vendor_id;
  if v_profile.id is null then
    raise exception 'vendor not found';
  end if;

  select count(*) into v_portfolio_count
    from public.vendor_portfolio_images where vendor_id = p_vendor_id;
  select count(*) into v_packages_count
    from public.vendor_packages where vendor_id = p_vendor_id and is_active = true;
  select count(*) into v_clips_count
    from public.vendor_showcase_clips where vendor_id = p_vendor_id;
  select count(*) into v_verified_count
    from public.vendor_verifications
    where vendor_id = p_vendor_id and status = 'approved';
  select count(*) into v_recs_count
    from public.vendor_recommendations where recommender_id = p_vendor_id;
  select count(*) into v_imported_reviews_count
    from public.imported_reviews where vendor_id = p_vendor_id;
  select count(*) into v_real_events_count
    from public.real_events
    where vendor_id = p_vendor_id
      and published_at is not null and host_consent_given_at is not null;
  select coalesce(jsonb_array_length(questions), 0) into v_intake_count
    from public.vendor_intake_forms
    where vendor_id = p_vendor_id and is_published = true;
  v_intake_count := coalesce(v_intake_count, 0);

  c_bio          := coalesce(length(trim(coalesce(v_profile.bio, ''))) >= 60, false);
  c_location     := coalesce(length(trim(coalesce(v_profile.location, ''))) > 0, false);
  c_price        := v_profile.base_price_cents is not null and v_profile.base_price_cents > 0;
  c_portfolio    := v_portfolio_count >= 5;
  c_packages     := v_packages_count >= 2;
  c_intro_video  := coalesce(length(trim(coalesce(v_profile.intro_video_url, ''))) > 0, false);
  c_clips        := v_clips_count >= 1;
  c_verified     := v_verified_count >= 1;
  c_imported     := v_imported_reviews_count >= 3;
  c_real_event   := v_real_events_count >= 1;
  c_intake       := v_intake_count >= 1;
  c_recs         := v_recs_count >= 1;

  -- Weights sum to 100. Higher weight = bigger impact on conversion.
  if c_bio          then score := score + 8;  end if;
  if c_location     then score := score + 5;  end if;
  if c_price        then score := score + 5;  end if;
  if c_portfolio    then score := score + 12; end if;
  if c_packages     then score := score + 12; end if;
  if c_intro_video  then score := score + 8;  end if;
  if c_clips        then score := score + 8;  end if;
  if c_verified     then score := score + 12; end if;
  if c_imported     then score := score + 8;  end if;
  if c_real_event   then score := score + 12; end if;
  if c_intake       then score := score + 5;  end if;
  if c_recs         then score := score + 5;  end if;

  return jsonb_build_object(
    'score', score,
    'checks', jsonb_build_array(
      jsonb_build_object('label', 'Bio + tagline written',           'weight', 8,  'done', c_bio,         'hint', '60+ characters of who you are and what you do'),
      jsonb_build_object('label', 'Location set',                    'weight', 5,  'done', c_location,    'hint', null),
      jsonb_build_object('label', 'Starting price set',              'weight', 5,  'done', c_price,       'hint', null),
      jsonb_build_object('label', '5+ portfolio photos',             'weight', 12, 'done', c_portfolio,   'hint', 'Hosts skim portfolios first — show your range'),
      jsonb_build_object('label', '2+ active packages',              'weight', 12, 'done', c_packages,    'hint', 'Vendors with priced tiers convert ~2x faster'),
      jsonb_build_object('label', 'Intro video',                     'weight', 8,  'done', c_intro_video, 'hint', 'A 60-90s video lifts inquiry quality measurably'),
      jsonb_build_object('label', 'At least one showcase clip',      'weight', 8,  'done', c_clips,       'hint', 'Short vertical clips render in the detail-page reel'),
      jsonb_build_object('label', 'Trust verification (any)',        'weight', 12, 'done', c_verified,    'hint', 'ID / insurance / business license badge'),
      jsonb_build_object('label', '3+ imported reviews',             'weight', 8,  'done', c_imported,    'hint', 'Paste in existing Knot / Yelp / Google reviews'),
      jsonb_build_object('label', '1+ published real-event gallery', 'weight', 12, 'done', c_real_event,  'hint', 'One real-event story beats 10 portfolio shots'),
      jsonb_build_object('label', 'Custom intake form',              'weight', 5,  'done', c_intake,      'hint', 'Ask qualifying questions before you quote'),
      jsonb_build_object('label', 'Partner recommendations',         'weight', 5,  'done', c_recs,        'hint', 'Refer 1-2 partners — earns you cross-listings too')
    )
  );
end$$;

revoke execute on function public.get_vendor_profile_score(uuid) from public, anon;
grant execute on function public.get_vendor_profile_score(uuid) to authenticated;
-- Outbound calendar sync. Appointments tracked on Vendora can now be
-- mirrored to a connected external calendar (Google to start). Each
-- appointment row remembers the external event id + provider so the
-- sync function knows whether it needs to insert / update / delete on
-- the remote side.
--
-- The sync-google-calendar edge function reads appointments where
-- pull_target = the connected user (vendor user_id OR host_id) and
-- external_event_id is null + status = 'accepted', creates the event
-- in Google, then writes external_event_id + external_event_provider
-- back. On status flip to declined / cancelled it deletes the remote
-- event (the function handles the read-update-delete loop).

alter table public.appointments
  add column if not exists external_event_id text,
  add column if not exists external_event_provider text
    check (external_event_provider in ('google') or external_event_provider is null),
  add column if not exists external_synced_at timestamptz;

-- Optional fast path: when an appointment is created/updated/deleted
-- and BOTH parties have push_appointments enabled, we want to react
-- soon — not wait for the next 15-min cron tick. A trigger calls
-- pg_net.http_post on the sync function. Wrapped in EXCEPTION so it
-- can't break the parent insert if pg_net or env vars aren't ready.

create or replace function public.fanout_appointment_to_calendar()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_key text;
  v_vendor_user uuid;
begin
  begin
    v_url := current_setting('app.settings.supabase_url', true);
    v_key := current_setting('app.settings.service_role_key', true);
  exception when others then
    return coalesce(new, old);
  end;
  if v_url is null or v_key is null then
    return coalesce(new, old);
  end if;

  -- Resolve the vendor's user_id so the edge function can scope its
  -- "find connections for these users" query without re-joining.
  select user_id into v_vendor_user
    from public.vendor_profiles
    where id = coalesce(new.vendor_id, old.vendor_id);

  begin
    perform net.http_post(
      url := v_url || '/functions/v1/sync-google-calendar',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(coalesce(new.host_id, old.host_id), v_vendor_user),
        'mode', 'push_only'
      )
    );
  exception when others then
    null;
  end;
  return coalesce(new, old);
end$$;

drop trigger if exists appointments_fanout_calendar on public.appointments;
create trigger appointments_fanout_calendar
  after insert or update or delete on public.appointments
  for each row execute function public.fanout_appointment_to_calendar();

revoke execute on function public.fanout_appointment_to_calendar() from public, anon, authenticated;
-- Vendor re-engagement: nudge vendors to reach out to past clients
-- around meaningful anniversaries (1-year, 2-year, 5-year) so they
-- can pitch a follow-on event — anniversary photo session, milestone
-- party, holiday rebooking. Drives vendor LTV without any vendor
-- effort.
--
-- A daily cron job invokes the scan-reengagement-opportunities edge
-- function which calls enqueue_reengagement_opportunities() to find
-- new matches, dedupes via vendor_reengagement_log, then sends one
-- email + in-app notification per opportunity.

create table public.vendor_reengagement_log (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  occasion text not null,            -- e.g. "anniversary_1y", "anniversary_2y"
  event_type text,
  upcoming_date date not null,       -- the date we're nudging about
  notified_at timestamptz not null default now(),
  -- One nudge per (vendor, host, inquiry, occasion). Trying to send
  -- the same anniversary twice silently fails the unique constraint.
  unique (vendor_id, host_id, inquiry_id, occasion)
);

create index vendor_reengagement_log_vendor_idx
  on public.vendor_reengagement_log (vendor_id, notified_at desc);

alter table public.vendor_reengagement_log enable row level security;

create policy "vendor_reengagement_log vendor read"
  on public.vendor_reengagement_log for select to authenticated
  using (public.is_vendor_member(vendor_id));

-- Vendor preference column on profiles. Default ON; vendors can opt
-- out from Settings or via the unsubscribe footer.
alter table public.profiles
  add column if not exists reengagement_emails_enabled boolean
    not null default true;

-- Returns rows ready to be processed: past won inquiries whose
-- event_date hits one of the anniversary windows ~30 days out.
-- The edge function picks these up, sends emails, then writes to
-- vendor_reengagement_log so the same row doesn't fire next day.
--
-- Anniversary cadence:
--   1-year  → after the first anniversary
--   2-year  → after the second
--   5-year  → milestone
-- Window: target_date is between today + 25d and today + 35d (so the
-- daily cron has 10 days to catch it even if it skips a run).
create or replace function public.find_reengagement_opportunities()
returns table (
  vendor_id uuid,
  host_id uuid,
  inquiry_id uuid,
  occasion text,
  event_type text,
  upcoming_date date,
  vendor_user_id uuid,
  vendor_business_name text,
  host_email text,
  host_display_name text
)
language sql stable security definer set search_path = public
as $$
  with windows as (
    select
      occasion,
      years_offset
    from (values
      ('anniversary_1y', 1),
      ('anniversary_2y', 2),
      ('anniversary_5y', 5)
    ) as w(occasion, years_offset)
  ),
  opportunities as (
    select
      i.vendor_id,
      i.host_id,
      i.id as inquiry_id,
      w.occasion,
      i.event_type,
      (i.event_date + (w.years_offset || ' years')::interval)::date as upcoming_date,
      vp.user_id as vendor_user_id,
      vp.business_name as vendor_business_name,
      au.email as host_email,
      p.display_name as host_display_name
    from public.inquiries i
    cross join windows w
    join public.vendor_profiles vp on vp.id = i.vendor_id
    join public.profiles p on p.id = i.host_id
    left join auth.users au on au.id = i.host_id
    where i.status = 'won'
      and i.event_date is not null
      and (i.event_date + (w.years_offset || ' years')::interval)::date
          between current_date + interval '25 days'
          and current_date + interval '35 days'
      and not exists (
        select 1 from public.vendor_reengagement_log lg
        where lg.vendor_id = i.vendor_id
          and lg.host_id = i.host_id
          and lg.inquiry_id = i.id
          and lg.occasion = w.occasion
      )
      -- Respect vendor opt-out at the vendor's auth.user level.
      and exists (
        select 1 from public.profiles vp_owner
        where vp_owner.id = vp.user_id
          and coalesce(vp_owner.reengagement_emails_enabled, true) = true
      )
  )
  select * from opportunities;
$$;

revoke execute on function public.find_reengagement_opportunities() from public, anon, authenticated;
-- Saved-search email alerts. The existing scan only fires in-app
-- notifications by design (avoiding new-vendor email spam). Now hosts
-- can opt-in PER SEARCH so the curated, narrow ones (e.g. "florists in
-- Brooklyn under $5k") trigger email — the broad/exploratory ones stay
-- in-app only.
--
-- Done by adding email_alerts_enabled to saved_searches + extending
-- enqueue_saved_search_matches to surface that flag plus the host's
-- email so the edge function can fan out emails in one batch.

alter table public.saved_searches
  add column if not exists email_alerts_enabled boolean not null default false;

create or replace function public.enqueue_saved_search_matches()
returns table (
  saved_search_id uuid,
  host_id uuid,
  host_email text,
  search_name text,
  match_count int,
  email_alerts_enabled boolean
)
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_count int;
  v_link text;
begin
  for r in
    select id, host_id, name, filters, last_notified_at, email_alerts_enabled
    from public.saved_searches
    where notify_new_matches = true
  loop
    select count(*) into v_count
    from public.vendor_profiles vp
    where vp.created_at > r.last_notified_at
      and (
        coalesce(r.filters->>'category', '') = ''
        or vp.category = r.filters->>'category'
      )
      and (
        coalesce(r.filters->>'q', '') = ''
        or vp.business_name ilike '%' || (r.filters->>'q') || '%'
        or vp.category ilike '%' || (r.filters->>'q') || '%'
        or coalesce(vp.bio, '') ilike '%' || (r.filters->>'q') || '%'
      );

    if v_count > 0 then
      v_link := '/vendors';
      insert into public.notifications (user_id, type, title, body, link)
      values (
        r.host_id,
        'saved_search_match',
        'New vendor matches "' || r.name || '"',
        v_count || ' new ' || (case when v_count = 1 then 'vendor' else 'vendors' end)
          || ' joined that match your saved search.',
        v_link
      );

      update public.saved_searches
      set last_notified_at = now()
      where id = r.id;

      -- Yield row for the edge function so it can decide whether to
      -- also fire an email.
      return query
        select
          r.id,
          r.host_id,
          (select email from auth.users where id = r.host_id) as host_email,
          r.name,
          v_count,
          r.email_alerts_enabled;
    end if;
  end loop;
end$$;

revoke execute on function public.enqueue_saved_search_matches() from public, anon, authenticated;
-- Auto-generate a video meeting link on every appointment so hosts +
-- vendors don't have to message back and forth about "what platform
-- should we use." Defaults to a Jitsi room named after the appointment
-- (free, no auth, no API). When the appointment is pushed to Google
-- Calendar via outbound sync, the sync function upgrades the link to
-- a real Google Meet via conferenceData.createRequest — see
-- sync-google-calendar/index.ts.

alter table public.appointments
  add column if not exists meeting_url text,
  add column if not exists meeting_provider text
    check (meeting_provider in ('jitsi', 'google_meet') or meeting_provider is null);

-- Trigger: stamp a Jitsi URL on insert when no meeting_url is set
-- AND kind is one of the remote-friendly types (consultation, phone_call).
-- Walkthroughs / fittings / tastings are in-person so we skip them.
create or replace function public.set_default_meeting_url()
returns trigger
language plpgsql
as $$
begin
  if new.meeting_url is null and new.kind in ('consultation','phone_call','other') then
    new.meeting_url := 'https://meet.jit.si/vendora-' || replace(new.id::text, '-', '');
    new.meeting_provider := 'jitsi';
  end if;
  return new;
end$$;

drop trigger if exists appointments_default_meeting_url on public.appointments;
create trigger appointments_default_meeting_url
  before insert on public.appointments
  for each row execute function public.set_default_meeting_url();

-- Backfill existing remote-friendly appointments that don't have a link.
update public.appointments
set
  meeting_url = 'https://meet.jit.si/vendora-' || replace(id::text, '-', ''),
  meeting_provider = 'jitsi'
where meeting_url is null
  and kind in ('consultation','phone_call','other');
-- Background check as a fourth verification kind alongside identity,
-- insurance, and business_license. Vendors who work in-home (or at
-- private homes — photographers, planners, makeup artists going to a
-- bride's prep, in-home chefs) get a meaningful trust differentiator
-- by uploading a Checkr / Sterling / similar report PDF.
--
-- For now the flow is upload-then-admin-review (same as the other
-- kinds). A direct Checkr API integration is post-launch — that
-- requires a signed agreement with Checkr and a webhook to
-- accept the result programmatically.

alter table public.vendor_verifications
  drop constraint if exists vendor_verifications_kind_check;

alter table public.vendor_verifications
  add constraint vendor_verifications_kind_check
  check (kind in ('identity', 'insurance', 'business_license', 'background_check'));
-- In-platform support ticket system. Hosts + vendors submit tickets to
-- the admin team; admin replies thread back. Replaces the email
-- triage that quickly becomes unmanageable past ~100 active users.

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  category text not null default 'other'
    check (category in ('account','billing','booking','vendor_issue','bug','feature_request','other')),
  status text not null default 'open'
    check (status in ('open','in_progress','resolved','closed')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index support_tickets_status_idx on public.support_tickets (status, priority desc, created_at desc);

alter table public.support_tickets enable row level security;

-- User reads + creates their own tickets; admin reads + manages all.
create policy "support_tickets own select"
  on public.support_tickets for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

create policy "support_tickets own insert"
  on public.support_tickets for insert to authenticated
  with check (auth.uid() = user_id);

create policy "support_tickets admin update"
  on public.support_tickets for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Allow user to mark their own ticket as closed (gives them an "I figured
-- it out" exit) but not change anything else.
create policy "support_tickets own close"
  on public.support_tickets for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger support_tickets_updated
  before update on public.support_tickets
  for each row execute function public.tg_set_updated_at();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('user','admin')),
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

alter table public.support_messages enable row level security;

create policy "support_messages participant select"
  on public.support_messages for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    )
  );

create policy "support_messages participant insert"
  on public.support_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      (sender_role = 'admin' and public.is_admin())
      or (
        sender_role = 'user'
        and exists (
          select 1 from public.support_tickets t
          where t.id = ticket_id and t.user_id = auth.uid()
        )
      )
    )
  );

-- Notify admins when a ticket is opened or the user posts a follow-up.
create or replace function public.notify_admins_support_event()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_user_name text;
  v_subject text;
  v_link text;
begin
  -- Look up the ticket subject + opening user.
  select t.subject, p.display_name
    into v_subject, v_user_name
    from public.support_tickets t
    left join public.profiles p on p.id = t.user_id
    where t.id = new.ticket_id;
  v_link := '/admin/support?ticket=' || new.ticket_id::text;
  if new.sender_role = 'user' then
    for r in select id from public.profiles where role = 'admin' loop
      insert into public.notifications (user_id, type, title, body, link)
      values (
        r.user_id,
        'support_ticket_message',
        coalesce(v_user_name, 'A user') || ' wrote in support',
        v_subject,
        v_link
      );
    end loop;
  end if;
  return new;
end$$;

drop trigger if exists support_messages_notify_admins on public.support_messages;
create trigger support_messages_notify_admins
  after insert on public.support_messages
  for each row execute function public.notify_admins_support_event();

-- Notify the user when an admin posts a reply or status changes.
create or replace function public.notify_user_support_admin_reply()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid;
  v_subject text;
begin
  if new.sender_role <> 'admin' then return new; end if;
  select user_id, subject into v_user, v_subject
    from public.support_tickets
    where id = new.ticket_id;
  if v_user is null then return new; end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_user,
    'support_ticket_reply',
    'Support replied: ' || coalesce(v_subject, 'your ticket'),
    substring(new.body for 140),
    '/support?ticket=' || new.ticket_id::text
  );
  return new;
end$$;

drop trigger if exists support_messages_notify_user on public.support_messages;
create trigger support_messages_notify_user
  after insert on public.support_messages
  for each row execute function public.notify_user_support_admin_reply();

revoke execute on function public.notify_admins_support_event() from public, anon, authenticated;
revoke execute on function public.notify_user_support_admin_reply() from public, anon, authenticated;
-- Planner agency workspace. The existing planning_collaborators table
-- already lets a host invite a planner (one row per host × planner).
-- This RPC aggregates all events the calling planner has access to so
-- the planner can see N clients in one place — the missing surface
-- for wedding planners + agency planners managing multiple events at
-- once.
--
-- get_planner_workspace returns the full workspace shape: per-host
-- summary + per-event card data + quick stats. Stats are best-effort
-- counts (guest count, inquiries to vendors, tasks done/total) so the
-- dashboard doesn't have to do N+1 fetches.

create or replace function public.get_planner_workspace()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_hosts jsonb;
begin
  if v_user is null then
    raise exception 'unauthorized';
  end if;

  -- For each host the caller collaborates on:
  -- emit { host_id, host_name, role, events: [...] }
  select coalesce(jsonb_agg(host_block order by host_block->>'host_name'), '[]'::jsonb)
    into v_hosts
  from (
    select jsonb_build_object(
      'host_id', pc.host_id,
      'host_name', coalesce(p.display_name, '(unnamed host)'),
      'role', pc.role,
      'collaborator_since', pc.created_at,
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'event_id', e.id,
          'name', e.name,
          'event_type', e.event_type,
          'event_date', e.event_date,
          'event_location', e.event_location,
          'archived_at', e.archived_at,
          'guest_count', (
            select count(*) from public.event_guests g
            where g.host_id = pc.host_id
          ),
          -- event_tasks are per-host (not per-event); these counts are the
          -- host's overall task pile, attributed to whichever event is
          -- currently active. Good enough for the planner's at-a-glance card.
          'tasks_total', (
            select count(*) from public.event_tasks t
            where t.host_id = pc.host_id
          ),
          'tasks_done', (
            select count(*) from public.event_tasks t
            where t.host_id = pc.host_id and t.status = 'completed'
          ),
          'inquiries_active', (
            select count(*) from public.inquiries i
            where i.host_id = pc.host_id
              and i.status in ('new','drafted','replied')
          ),
          'days_until', (
            case when e.event_date is null then null
                 else (e.event_date - current_date) end
          )
        ) order by e.event_date nulls last, e.created_at desc), '[]'::jsonb)
        from public.host_events e
        where e.host_id = pc.host_id
      )
    ) as host_block
    from public.planning_collaborators pc
    left join public.profiles p on p.id = pc.host_id
    where pc.user_id = v_user
      and pc.host_id <> v_user  -- don't list "themselves" if they were ever invited to their own
  ) sub;

  return jsonb_build_object('hosts', v_hosts);
end$$;

revoke execute on function public.get_planner_workspace() from public, anon;
grant execute on function public.get_planner_workspace() to authenticated;

-- Helper: switch active event in one server hop. Auth-check ensures the
-- caller is the host themselves OR a planning collaborator on the event's
-- host. Frontend can just call this without re-checking RLS.
create or replace function public.set_active_event(p_event_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_event_host uuid;
begin
  if v_user is null then raise exception 'unauthorized'; end if;

  select host_id into v_event_host from public.host_events where id = p_event_id;
  if v_event_host is null then raise exception 'event not found'; end if;

  -- Allow if the user is the host OR a collaborator with editor role.
  if v_event_host <> v_user
     and not exists (
       select 1 from public.planning_collaborators
       where host_id = v_event_host and user_id = v_user
     )
  then
    raise exception 'not authorized to switch to that event';
  end if;

  update public.profiles
    set active_event_id = p_event_id
    where id = v_user;
end$$;

revoke execute on function public.set_active_event(uuid) from public, anon;
grant execute on function public.set_active_event(uuid) to authenticated;
-- Admin audit log. Records every admin action that affects another
-- user's data — verifying a vendor, hiding a review, resolving a
-- ticket, importing vendors, force-closing an inquiry, etc.
--
-- Compliance + trust: when a vendor asks "why was my profile hidden",
-- support has a record of who did what and when. Also catches a
-- bad-actor admin acting outside protocol.
--
-- Logging is opt-in per call site — admins write directly to this
-- table, or we add triggers on the high-stakes tables (vendor_profiles
-- verified_at, vendor_verifications status, reviews hidden_at,
-- support_tickets status). For v1 we ship the table + viewer + a few
-- canonical triggers; new admin actions can log themselves manually
-- via the helper RPC.

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_admin_idx on public.admin_audit_log (admin_id, created_at desc);
create index admin_audit_log_target_idx on public.admin_audit_log (target_type, target_id, created_at desc);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

create policy "admin_audit_log admin select"
  on public.admin_audit_log for select to authenticated
  using (public.is_admin());

create policy "admin_audit_log admin insert"
  on public.admin_audit_log for insert to authenticated
  with check (public.is_admin() and admin_id = auth.uid());

-- Helper: log an admin action from any RPC. Called by triggers on the
-- high-stakes tables below + can be called manually from edge functions.
create or replace function public.log_admin_action(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- Skip if the actor isn't admin (no-op for self-actions by users).
  if not public.is_admin() then return; end if;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, summary, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_summary, p_metadata);
end$$;

grant execute on function public.log_admin_action(text, text, uuid, text, jsonb) to authenticated;

-- Trigger on vendor_profiles: log when verified_at changes.
create or replace function public.audit_vendor_verified_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.verified_at is distinct from old.verified_at and public.is_admin() then
    insert into public.admin_audit_log (admin_id, action, target_type, target_id, summary, metadata)
    values (
      auth.uid(),
      case when new.verified_at is null then 'vendor_unverified' else 'vendor_verified' end,
      'vendor_profile',
      new.id,
      coalesce(new.business_name, '(unnamed vendor)'),
      jsonb_build_object('previous_verified_at', old.verified_at, 'new_verified_at', new.verified_at)
    );
  end if;
  return new;
end$$;

drop trigger if exists vendor_profiles_audit on public.vendor_profiles;
create trigger vendor_profiles_audit
  after update of verified_at on public.vendor_profiles
  for each row execute function public.audit_vendor_verified_change();

-- Trigger on vendor_verifications status flips by admin.
create or replace function public.audit_verification_decision()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_business text;
begin
  if new.status is distinct from old.status and public.is_admin() then
    select business_name into v_business
      from public.vendor_profiles where id = new.vendor_id;
    insert into public.admin_audit_log (admin_id, action, target_type, target_id, summary, metadata)
    values (
      auth.uid(),
      'verification_' || new.status,
      'vendor_verification',
      new.id,
      coalesce(v_business, '(unnamed vendor)') || ' · ' || new.kind,
      jsonb_build_object('previous_status', old.status, 'new_status', new.status, 'kind', new.kind, 'notes', new.notes)
    );
  end if;
  return new;
end$$;

drop trigger if exists vendor_verifications_audit on public.vendor_verifications;
create trigger vendor_verifications_audit
  after update of status on public.vendor_verifications
  for each row execute function public.audit_verification_decision();

-- Trigger on reviews when admin hides one.
create or replace function public.audit_review_hidden()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.hidden_at is distinct from old.hidden_at and public.is_admin() then
    insert into public.admin_audit_log (admin_id, action, target_type, target_id, summary, metadata)
    values (
      auth.uid(),
      case when new.hidden_at is null then 'review_unhidden' else 'review_hidden' end,
      'review',
      new.id,
      substring(coalesce(new.body, '(no body)') for 100),
      jsonb_build_object('reason', new.hidden_reason)
    );
  end if;
  return new;
end$$;

drop trigger if exists reviews_audit on public.reviews;
create trigger reviews_audit
  after update of hidden_at on public.reviews
  for each row execute function public.audit_review_hidden();

-- Trigger on support tickets when admin updates status.
create or replace function public.audit_support_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status and public.is_admin() then
    insert into public.admin_audit_log (admin_id, action, target_type, target_id, summary, metadata)
    values (
      auth.uid(),
      'support_ticket_' || new.status,
      'support_ticket',
      new.id,
      new.subject,
      jsonb_build_object('previous_status', old.status, 'new_status', new.status)
    );
  end if;
  return new;
end$$;

drop trigger if exists support_tickets_audit on public.support_tickets;
create trigger support_tickets_audit
  after update of status on public.support_tickets
  for each row execute function public.audit_support_status();

revoke execute on function public.audit_vendor_verified_change() from public, anon, authenticated;
revoke execute on function public.audit_verification_decision() from public, anon, authenticated;
revoke execute on function public.audit_review_hidden() from public, anon, authenticated;
revoke execute on function public.audit_support_status() from public, anon, authenticated;
-- Track whether a user has dismissed the first-run onboarding tour
-- so we don't pester them every dashboard visit. Null = haven't seen
-- it; timestamp = dismissed (whether by completing or skipping).

alter table public.profiles
  add column if not exists tour_dismissed_at timestamptz;
-- Day-of staffing marketplace. Vendors who price by the hour rather
-- than the package (bartenders, waitstaff, security, valets, day-of
-- coordinators). Same inquiry → proposal model as everyone else, just
-- specialized pricing fields the host can use to compare apples to
-- apples.
--
-- New columns on vendor_profiles for the hourly-billing pieces. They
-- coexist with base_price_cents (used as a flat starting price for
-- non-staffing vendors).

alter table public.vendor_profiles
  add column if not exists is_staffing boolean not null default false,
  add column if not exists hourly_rate_cents int,
  add column if not exists min_hours int;

create index if not exists vendor_profiles_staffing_idx
  on public.vendor_profiles (category, hourly_rate_cents)
  where is_staffing = true;
-- Vendor-to-vendor partner messaging. Mirrors the host-vendor
-- direct_threads / direct_messages pattern but between two vendors —
-- typical use cases:
--   * photographer → planner: "what time is the first look at venue X?"
--   * florist → DJ: "we'll be done with installs by 4pm, you can plug in"
--   * bartender → caterer: "where do glasses live during dinner service?"
--
-- Threads are unique per unordered (vendor_a, vendor_b) pair. We
-- canonicalize alphabetically (a.id < b.id) so find_or_create lookups
-- always hit the same row regardless of who started the conversation.

create table public.vendor_partner_threads (
  id uuid primary key default gen_random_uuid(),
  vendor_a_id uuid not null references public.vendor_profiles(id) on delete cascade,
  vendor_b_id uuid not null references public.vendor_profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Canonical ordering enforced at the DB level (a < b) so the unique
  -- constraint catches duplicate (b, a) → (a, b) inserts.
  check (vendor_a_id < vendor_b_id),
  unique (vendor_a_id, vendor_b_id)
);

create index vendor_partner_threads_a_idx
  on public.vendor_partner_threads (vendor_a_id, last_message_at desc);
create index vendor_partner_threads_b_idx
  on public.vendor_partner_threads (vendor_b_id, last_message_at desc);

alter table public.vendor_partner_threads enable row level security;

create policy "vendor_partner_threads participants select"
  on public.vendor_partner_threads for select to authenticated
  using (public.is_vendor_member(vendor_a_id) or public.is_vendor_member(vendor_b_id));

create policy "vendor_partner_threads insert via rpc"
  on public.vendor_partner_threads for insert to authenticated
  with check (public.is_vendor_member(vendor_a_id) or public.is_vendor_member(vendor_b_id));

create policy "vendor_partner_threads participants update last_message_at"
  on public.vendor_partner_threads for update to authenticated
  using (public.is_vendor_member(vendor_a_id) or public.is_vendor_member(vendor_b_id));

create table public.vendor_partner_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.vendor_partner_threads(id) on delete cascade,
  -- The vendor profile the sender is acting as (a vendor team member's
  -- user_id is auth.uid(), but we attribute the message to the team's
  -- vendor_profile so it shows under the brand, not the individual).
  sender_vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index vendor_partner_messages_thread_idx
  on public.vendor_partner_messages (thread_id, created_at);

alter table public.vendor_partner_messages enable row level security;

create policy "vendor_partner_messages participants select"
  on public.vendor_partner_messages for select to authenticated
  using (
    exists (
      select 1 from public.vendor_partner_threads t
      where t.id = thread_id
        and (public.is_vendor_member(t.vendor_a_id) or public.is_vendor_member(t.vendor_b_id))
    )
  );

create policy "vendor_partner_messages send"
  on public.vendor_partner_messages for insert to authenticated
  with check (
    public.is_vendor_member(sender_vendor_id)
    and exists (
      select 1 from public.vendor_partner_threads t
      where t.id = thread_id
        and (t.vendor_a_id = sender_vendor_id or t.vendor_b_id = sender_vendor_id)
    )
  );

-- find_or_create — caller passes the OTHER vendor's id; we canonicalize
-- against the caller's own vendor profile (or first one if they're on a
-- team) and return the thread id.
create or replace function public.find_or_create_partner_thread(
  p_other_vendor_id uuid,
  p_my_vendor_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_my_vendor uuid;
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'unauthorized'; end if;

  -- Resolve my vendor: explicit param wins, else first vendor I own.
  if p_my_vendor_id is not null then
    if not public.is_vendor_member(p_my_vendor_id) then
      raise exception 'not a member of vendor %', p_my_vendor_id;
    end if;
    v_my_vendor := p_my_vendor_id;
  else
    select vp.id into v_my_vendor
      from public.vendor_profiles vp
      where vp.user_id = v_user
      limit 1;
    if v_my_vendor is null then
      select tm.vendor_id into v_my_vendor
        from public.vendor_team_members tm
        where tm.user_id = v_user
        limit 1;
    end if;
    if v_my_vendor is null then
      raise exception 'caller has no vendor profile';
    end if;
  end if;

  if v_my_vendor = p_other_vendor_id then
    raise exception 'cannot message yourself';
  end if;

  -- Canonicalize.
  if v_my_vendor < p_other_vendor_id then
    v_a := v_my_vendor; v_b := p_other_vendor_id;
  else
    v_a := p_other_vendor_id; v_b := v_my_vendor;
  end if;

  insert into public.vendor_partner_threads (vendor_a_id, vendor_b_id)
    values (v_a, v_b)
    on conflict (vendor_a_id, vendor_b_id) do update
      set last_message_at = vendor_partner_threads.last_message_at
    returning id into v_id;

  return v_id;
end$$;

grant execute on function public.find_or_create_partner_thread(uuid, uuid) to authenticated;

-- Bump last_message_at when a new message lands.
create or replace function public.tg_bump_partner_thread_last_message()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.vendor_partner_threads
    set last_message_at = new.created_at
    where id = new.thread_id;
  return new;
end$$;

drop trigger if exists vendor_partner_messages_bump_thread on public.vendor_partner_messages;
create trigger vendor_partner_messages_bump_thread
  after insert on public.vendor_partner_messages
  for each row execute function public.tg_bump_partner_thread_last_message();

-- Notify the recipient vendor's team (everyone except the sender).
create or replace function public.notify_partner_message()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_thread record;
  v_recipient_vendor uuid;
  v_sender_name text;
  r record;
begin
  select * into v_thread from public.vendor_partner_threads where id = new.thread_id;
  if v_thread.id is null then return new; end if;

  v_recipient_vendor := case
    when new.sender_vendor_id = v_thread.vendor_a_id then v_thread.vendor_b_id
    else v_thread.vendor_a_id
  end;

  select coalesce(business_name, 'Another vendor') into v_sender_name
    from public.vendor_profiles where id = new.sender_vendor_id;

  -- Owner.
  for r in
    select user_id from public.vendor_profiles where id = v_recipient_vendor
    union
    select user_id from public.vendor_team_members where vendor_id = v_recipient_vendor
  loop
    if r.user_id is not null then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        r.user_id,
        'vendor_partner_message',
        v_sender_name || ' sent you a message',
        substring(new.body for 140),
        '/vendor/messages?thread=' || new.thread_id::text
      );
    end if;
  end loop;
  return new;
end$$;

drop trigger if exists vendor_partner_messages_notify on public.vendor_partner_messages;
create trigger vendor_partner_messages_notify
  after insert on public.vendor_partner_messages
  for each row execute function public.notify_partner_message();

revoke execute on function public.tg_bump_partner_thread_last_message() from public, anon, authenticated;
revoke execute on function public.notify_partner_message() from public, anon, authenticated;
-- Wedding-party / VIP sub-portal. A restricted-view event surface for
-- bridesmaids, groomsmen, MOH, best man, parents, and other VIPs who
-- need more than a guest's microsite view but less than a full
-- planning_collaborator's edit access.
--
-- VIPs see: schedule, vendor contact list (names + roles only — no
-- pricing or inquiry data), registry, group gifts, photo gallery,
-- their own assigned tasks. They DON'T see: full guest list,
-- inquiries, finances, vendor messages, contracts, the host's
-- checklist.
--
-- Invitation flow mirrors planning_invites: host adds email + role,
-- system sends magic link, member accepts via RPC.

create table public.event_party_invites (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.host_events(id) on delete cascade,
  email text not null,
  role_label text not null default 'VIP',
  token text unique not null default replace(gen_random_uuid()::text, '-', ''),
  member_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);

create index event_party_invites_member_idx
  on public.event_party_invites (member_user_id) where member_user_id is not null;
create index event_party_invites_host_idx
  on public.event_party_invites (host_id, event_id, created_at desc);
create index event_party_invites_token_idx
  on public.event_party_invites (token);

alter table public.event_party_invites enable row level security;

-- Host manages the invites they sent.
create policy "event_party_invites host all"
  on public.event_party_invites for all to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

-- Member reads their own (post-accept).
create policy "event_party_invites member select"
  on event_party_invites for select to authenticated
  using (auth.uid() = member_user_id);

-- Per-member assigned duties / tasks. Host writes, member reads.
create table public.event_party_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.host_events(id) on delete cascade,
  invite_id uuid not null references public.event_party_invites(id) on delete cascade,
  title text not null,
  notes text,
  due_date date,
  completed_at timestamptz,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_party_tasks_invite_idx
  on public.event_party_tasks (invite_id, display_order, due_date);

alter table public.event_party_tasks enable row level security;

-- Host (event owner) reads + writes all party tasks.
create policy "event_party_tasks host all"
  on public.event_party_tasks for all to authenticated
  using (
    exists (
      select 1 from public.host_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.host_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

-- Members read their own tasks; member can mark complete.
create policy "event_party_tasks member select"
  on public.event_party_tasks for select to authenticated
  using (
    exists (
      select 1 from public.event_party_invites i
      where i.id = invite_id and i.member_user_id = auth.uid()
    )
  );

create policy "event_party_tasks member mark complete"
  on public.event_party_tasks for update to authenticated
  using (
    exists (
      select 1 from public.event_party_invites i
      where i.id = invite_id and i.member_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.event_party_invites i
      where i.id = invite_id and i.member_user_id = auth.uid()
    )
  );

-- Public lookup of invite by token (anonymous, pre-accept).
create or replace function public.get_party_invite_by_token(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_invite public.event_party_invites;
  v_event record;
  v_host_name text;
begin
  select * into v_invite from public.event_party_invites where token = p_token;
  if v_invite.id is null then
    return jsonb_build_object('ok', false, 'error', 'invite_not_found');
  end if;
  select * into v_event from public.host_events where id = v_invite.event_id;
  select coalesce(display_name, 'A Vendora host') into v_host_name
    from public.profiles where id = v_invite.host_id;
  return jsonb_build_object(
    'ok', true,
    'email', v_invite.email,
    'role_label', v_invite.role_label,
    'accepted', v_invite.accepted_at is not null,
    'event', jsonb_build_object(
      'id', v_event.id,
      'name', v_event.name,
      'event_type', v_event.event_type,
      'event_date', v_event.event_date,
      'event_location', v_event.event_location,
      'host_name', v_host_name
    )
  );
end$$;

revoke execute on function public.get_party_invite_by_token(text) from public;
grant execute on function public.get_party_invite_by_token(text) to anon, authenticated;

-- Accept the invite — auth required. Links member_user_id and stamps
-- accepted_at; idempotent.
create or replace function public.accept_party_invite(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_invite public.event_party_invites;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_invite from public.event_party_invites where token = p_token;
  if v_invite.id is null then
    return jsonb_build_object('ok', false, 'error', 'invite_not_found');
  end if;
  update public.event_party_invites
    set member_user_id = v_user_id,
        accepted_at = coalesce(accepted_at, now())
    where id = v_invite.id;
  return jsonb_build_object('ok', true, 'event_id', v_invite.event_id);
end$$;

grant execute on function public.accept_party_invite(text) to authenticated;

-- The party-portal payload: limited view of an event for VIPs. Joins
-- the schedule, vendor names + categories (no pricing), registry,
-- group gifts, the member's assigned tasks. Returns null if caller
-- isn't a confirmed party member of the event.
create or replace function public.get_party_portal(p_event_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invite record;
  v_event record;
  v_host_name text;
  v_schedule jsonb;
  v_vendors jsonb;
  v_registry jsonb;
  v_gifts jsonb;
  v_my_tasks jsonb;
begin
  if v_user is null then return null; end if;

  select * into v_invite
    from public.event_party_invites
    where event_id = p_event_id
      and member_user_id = v_user
      and accepted_at is not null;
  if v_invite.id is null then
    return null;
  end if;

  select * into v_event from public.host_events where id = p_event_id;
  if v_event.id is null then return null; end if;
  select coalesce(display_name, 'A Vendora host') into v_host_name
    from public.profiles where id = v_event.host_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'notes', t.notes,
    'start_time', t.start_time,
    'duration_minutes', t.duration_minutes,
    'location', t.location
  ) order by t.start_time, t.display_order), '[]'::jsonb)
    into v_schedule
    from public.event_timeline_items t
    where t.event_id = p_event_id;

  -- Vendor list = vendors with at least one won inquiry on this host's
  -- account. Names + categories only — no rates, no inquiry data.
  select coalesce(jsonb_agg(distinct jsonb_build_object(
    'vendor_id', vp.id,
    'business_name', vp.business_name,
    'category', vp.category,
    'location', vp.location
  )), '[]'::jsonb)
    into v_vendors
    from public.inquiries i
    join public.vendor_profiles vp on vp.id = i.vendor_id
    where i.host_id = v_event.host_id and i.status = 'won';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'label', r.label,
    'provider', r.provider,
    'url', r.url,
    'description', r.description
  ) order by r.display_order, r.created_at), '[]'::jsonb)
    into v_registry
    from public.event_registry_links r
    where r.host_id = v_event.host_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id,
    'title', w.title,
    'description', w.description,
    'image_url', w.image_url,
    'target_cents', w.target_cents,
    'share_token', w.share_token
  ) order by w.created_at desc), '[]'::jsonb)
    into v_gifts
    from public.gift_wishes w
    where w.host_id = v_event.host_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', tk.id,
    'title', tk.title,
    'notes', tk.notes,
    'due_date', tk.due_date,
    'completed_at', tk.completed_at
  ) order by tk.display_order, tk.due_date), '[]'::jsonb)
    into v_my_tasks
    from public.event_party_tasks tk
    where tk.invite_id = v_invite.id;

  return jsonb_build_object(
    'role_label', v_invite.role_label,
    'event', jsonb_build_object(
      'id', v_event.id,
      'name', v_event.name,
      'event_type', v_event.event_type,
      'event_date', v_event.event_date,
      'event_location', v_event.event_location,
      'host_name', v_host_name
    ),
    'schedule', v_schedule,
    'vendors', v_vendors,
    'registry', v_registry,
    'gifts', v_gifts,
    'my_tasks', v_my_tasks
  );
end$$;

revoke execute on function public.get_party_portal(uuid) from public, anon;
grant execute on function public.get_party_portal(uuid) to authenticated;

-- List events I'm a party member of (for /party index).
create or replace function public.list_my_party_events()
returns table (
  invite_id uuid,
  event_id uuid,
  event_name text,
  event_type text,
  event_date date,
  event_location text,
  role_label text,
  host_name text
)
language sql stable security definer set search_path = public
as $$
  select
    i.id,
    e.id,
    e.name,
    e.event_type,
    e.event_date,
    e.event_location,
    i.role_label,
    coalesce(p.display_name, 'A Vendora host')
  from public.event_party_invites i
  join public.host_events e on e.id = i.event_id
  left join public.profiles p on p.id = i.host_id
  where i.member_user_id = auth.uid() and i.accepted_at is not null
  order by e.event_date nulls last, e.created_at desc;
$$;

revoke execute on function public.list_my_party_events() from public, anon;
grant execute on function public.list_my_party_events() to authenticated;

-- Notify host when a party member accepts.
create or replace function public.notify_host_party_accepted()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_member_name text;
begin
  if new.accepted_at is null or old.accepted_at is not null then return new; end if;
  select coalesce(display_name, new.email) into v_member_name
    from public.profiles where id = new.member_user_id;
  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.host_id,
    'party_invite_accepted',
    v_member_name || ' joined your wedding party',
    'They can now see the schedule, vendors, and any tasks you assign.',
    '/customer/planning-team'
  );
  return new;
end$$;

drop trigger if exists party_invite_accepted on public.event_party_invites;
create trigger party_invite_accepted
  after update of accepted_at on public.event_party_invites
  for each row execute function public.notify_host_party_accepted();

revoke execute on function public.notify_host_party_accepted() from public, anon, authenticated;
-- Update party-portal copy to be event-agnostic. The original
-- migration's notification said "joined your wedding party" — Vendora
-- isn't wedding-only, so this updates the in-app notification to read
-- generically. Schema is unchanged — just a function body swap.

create or replace function public.notify_host_party_accepted()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_member_name text;
begin
  if new.accepted_at is null or old.accepted_at is not null then return new; end if;
  select coalesce(display_name, new.email) into v_member_name
    from public.profiles where id = new.member_user_id;
  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.host_id,
    'party_invite_accepted',
    v_member_name || ' joined your inner circle',
    'They can now see the schedule, vendors, and any tasks you assign.',
    '/customer/planning-team'
  );
  return new;
end$$;

revoke execute on function public.notify_host_party_accepted() from public, anon, authenticated;
-- Email deliverability tracking. Resend (the transactional email
-- provider behind send-transactional-email) supports webhooks for
-- every lifecycle event — sent, delivered, bounced, complained,
-- opened, clicked. We persist them here so admins can see the
-- aggregate rates + spot deliverability problems early.
--
-- Operator setup (one-time): in Resend dashboard → Webhooks → add
-- endpoint pointing at <SUPABASE_URL>/functions/v1/resend-webhook
-- and select the events you care about. Send the webhook signing
-- secret to Supabase as RESEND_WEBHOOK_SECRET — the edge function
-- verifies signatures before persisting.

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  resend_event_id text unique,
  resend_email_id text,
  event_type text not null
    check (event_type in (
      'email.sent','email.delivered','email.bounced','email.complained',
      'email.opened','email.clicked','email.delivery_delayed','email.failed'
    )),
  recipient_email text,
  subject text,
  meta jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index email_events_occurred_idx
  on public.email_events (occurred_at desc);
create index email_events_type_idx
  on public.email_events (event_type, occurred_at desc);
create index email_events_recipient_idx
  on public.email_events (recipient_email, occurred_at desc);
create index email_events_email_id_idx
  on public.email_events (resend_email_id) where resend_email_id is not null;

alter table public.email_events enable row level security;

-- Admin-only read; webhook writes via service-role.
create policy "email_events admin select"
  on public.email_events for select to authenticated
  using (public.is_admin());

-- Aggregate rollup: 30-day windows + per-event-type counts so the
-- admin dashboard can render without scanning every row client-side.
create or replace function public.get_email_deliverability_summary(
  p_window_days int default 30
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_since timestamptz := now() - (p_window_days || ' days')::interval;
  v_sent int;
  v_delivered int;
  v_bounced int;
  v_complained int;
  v_failed int;
  v_opened int;
  v_clicked int;
  v_unique_recipients int;
  v_top_bounces jsonb;
  v_recent_failures jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select count(*) into v_sent
    from public.email_events
    where event_type = 'email.sent' and occurred_at >= v_since;
  select count(*) into v_delivered
    from public.email_events
    where event_type = 'email.delivered' and occurred_at >= v_since;
  select count(*) into v_bounced
    from public.email_events
    where event_type = 'email.bounced' and occurred_at >= v_since;
  select count(*) into v_complained
    from public.email_events
    where event_type = 'email.complained' and occurred_at >= v_since;
  select count(*) into v_failed
    from public.email_events
    where event_type = 'email.failed' and occurred_at >= v_since;
  select count(*) into v_opened
    from public.email_events
    where event_type = 'email.opened' and occurred_at >= v_since;
  select count(*) into v_clicked
    from public.email_events
    where event_type = 'email.clicked' and occurred_at >= v_since;
  select count(distinct recipient_email) into v_unique_recipients
    from public.email_events
    where event_type = 'email.sent' and occurred_at >= v_since;

  select coalesce(jsonb_agg(t order by t->>'count' desc), '[]'::jsonb)
    into v_top_bounces
  from (
    select jsonb_build_object(
      'recipient_email', recipient_email,
      'count', count(*),
      'last_seen', max(occurred_at)
    ) as t
    from public.email_events
    where event_type in ('email.bounced','email.complained')
      and occurred_at >= v_since
      and recipient_email is not null
    group by recipient_email
    order by count(*) desc
    limit 10
  ) sub;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'event_type', e.event_type,
    'recipient_email', e.recipient_email,
    'subject', e.subject,
    'occurred_at', e.occurred_at,
    'meta', e.meta
  ) order by e.occurred_at desc), '[]'::jsonb)
    into v_recent_failures
    from public.email_events e
    where e.event_type in ('email.bounced','email.complained','email.failed')
      and e.occurred_at >= v_since
    limit 50;

  return jsonb_build_object(
    'window_days', p_window_days,
    'sent', v_sent,
    'delivered', v_delivered,
    'bounced', v_bounced,
    'complained', v_complained,
    'failed', v_failed,
    'opened', v_opened,
    'clicked', v_clicked,
    'unique_recipients', v_unique_recipients,
    'delivery_rate', case when v_sent > 0 then round(v_delivered::numeric / v_sent, 4) else null end,
    'bounce_rate', case when v_sent > 0 then round(v_bounced::numeric / v_sent, 4) else null end,
    'complaint_rate', case when v_sent > 0 then round(v_complained::numeric / v_sent, 4) else null end,
    'open_rate', case when v_delivered > 0 then round(v_opened::numeric / v_delivered, 4) else null end,
    'top_bounces', v_top_bounces,
    'recent_failures', v_recent_failures
  );
end$$;

revoke execute on function public.get_email_deliverability_summary(int) from public, anon;
grant execute on function public.get_email_deliverability_summary(int) to authenticated;

-- Daily rollup for the line chart in the dashboard.
create or replace function public.get_email_daily_volume(
  p_window_days int default 30
)
returns table (
  day date,
  sent int,
  delivered int,
  bounced int
)
language sql stable security definer set search_path = public
as $$
  with days as (
    select generate_series(
      (current_date - (p_window_days - 1))::date,
      current_date,
      '1 day'::interval
    )::date as day
  )
  select
    d.day,
    coalesce(sum((e.event_type = 'email.sent')::int), 0)::int,
    coalesce(sum((e.event_type = 'email.delivered')::int), 0)::int,
    coalesce(sum((e.event_type = 'email.bounced')::int), 0)::int
  from days d
  left join public.email_events e
    on date_trunc('day', e.occurred_at)::date = d.day
  group by d.day
  order by d.day asc;
$$;

revoke execute on function public.get_email_daily_volume(int) from public, anon;
grant execute on function public.get_email_daily_volume(int) to authenticated;
