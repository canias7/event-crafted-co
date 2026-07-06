-- New plan structure: Free / Pro / Premium.
--   Free    — 100 MB gallery storage, 1 listing.
--   Pro     — 1 GB gallery storage, 4 listings, verified profile,
--             V2V messaging, Vendora CRM.
--   Premium — 5 GB gallery storage, 10 listings, AI employee (HILUX).
--
-- Internal tier slugs are unchanged ('pro' stays 'pro', Premium keeps
-- the 'studio' slug so Stripe products, the webhook, and every
-- profiles.subscription_tier value keep working). Only display copy
-- changes. Starter is retired: rows deactivated, existing subscribers
-- grandfathered (their tier value still resolves everywhere below).
--
-- Gallery caps move from image COUNT to STORAGE BYTES — gallery
-- bucket only; listing/portfolio photos are not counted.

-- ============================================================
-- 1. Catalog: vendor_credit_packages
-- ============================================================

update public.vendor_credit_packages
   set active = false
 where kind = 'subscription' and tier = 'starter';

update public.vendor_credit_packages
   set listings_copy = 'Up to 4 listings',
       highlights = '["1 GB gallery storage","Verified profile","Vendor-to-vendor messaging","Vendora CRM"]'::jsonb
 where kind = 'subscription' and tier = 'pro';

update public.vendor_credit_packages
   set display_name = 'Vendora Premium',
       listings_copy = 'Up to 10 listings',
       highlights = '["5 GB gallery storage","AI employee — HILUX auto-replies","Verified profile","Everything in Pro"]'::jsonb
 where kind = 'subscription' and tier = 'studio';

-- ============================================================
-- 2. Gallery storage caps (bytes, vendor-gallery bucket only)
-- ============================================================

create or replace function public.gallery_storage_cap_bytes(p_user_id uuid)
returns bigint
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_unlimited boolean;
  v_tier text;
begin
  select unlimited_listings, subscription_tier
    into v_unlimited, v_tier
    from public.profiles
   where id = p_user_id;
  if v_unlimited = true then
    return null; -- grandfathered / unlimited
  end if;

  v_tier := coalesce(v_tier, 'free');

  if    v_tier = 'studio'  then return 5368709120;  -- Premium: 5 GB
  elsif v_tier = 'pro'     then return 1073741824;  -- Pro: 1 GB
  elsif v_tier = 'starter' then return 262144000;   -- legacy Starter: 250 MB
  else                          return 104857600;   -- Free: 100 MB
  end if;
end;
$$;

create or replace function public.gallery_storage_used_bytes(p_user_id uuid)
returns bigint
language sql
stable security definer
set search_path to 'public', 'storage'
as $$
  select coalesce(sum((metadata->>'size')::bigint), 0)
    from storage.objects
   where owner = p_user_id
     and bucket_id = 'vendor-gallery';
$$;

-- One-round-trip status for clients: {used_bytes, cap_bytes}.
-- cap_bytes null = unlimited.
create or replace function public.gallery_storage_status(p_user_id uuid)
returns table (used_bytes bigint, cap_bytes bigint)
language sql
stable security definer
set search_path to 'public'
as $$
  select public.gallery_storage_used_bytes(p_user_id),
         public.gallery_storage_cap_bytes(p_user_id);
$$;

grant execute on function public.gallery_storage_cap_bytes(uuid) to authenticated;
grant execute on function public.gallery_storage_used_bytes(uuid) to authenticated;
grant execute on function public.gallery_storage_status(uuid) to authenticated;

-- Retire the image-count cap: return NULL (uncapped) for every tier
-- so deployed clients that still pre-check user_image_cap never
-- block on counts. The bytes-based storage policy below is the
-- real enforcement now.
create or replace function public.user_image_cap(p_user_id uuid)
returns integer
language sql
stable security definer
set search_path to 'public'
as $$
  select null::integer;
$$;

-- Swap the storage.objects insert policy from count-based to
-- bytes-based. Same shape as the old "vendor image cap" policy:
-- lets an upload start while usage is under the cap (one-file
-- overshoot possible, same semantics as count < cap).
drop policy if exists "vendor image cap" on storage.objects;
create policy "vendor gallery storage cap"
  on storage.objects
  for insert
  with check (
    bucket_id <> 'vendor-gallery'
    or is_admin()
    or public.gallery_storage_cap_bytes(coalesce(owner, auth.uid())) is null
    or public.gallery_storage_used_bytes(coalesce(owner, auth.uid()))
         < public.gallery_storage_cap_bytes(coalesce(owner, auth.uid()))
  );

-- ============================================================
-- 3. Listing caps: Free 1 / Pro 4 / Premium 10
-- ============================================================

create or replace function public.user_listing_cap(p_user_id uuid)
returns integer
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_unlimited boolean;
  v_tier text;
begin
  select unlimited_listings, subscription_tier
    into v_unlimited, v_tier
    from public.profiles
   where id = p_user_id;
  if v_unlimited = true then
    return null;
  end if;

  v_tier := coalesce(v_tier, 'free');

  if    v_tier = 'studio'  then return 10; -- Premium
  elsif v_tier = 'pro'     then return 4;
  elsif v_tier = 'starter' then return 1;  -- legacy
  else                          return 1;  -- free
  end if;
end;
$$;

grant execute on function public.user_listing_cap(uuid) to authenticated;

create or replace function public.user_listing_count(p_user_id uuid)
returns integer
language sql
stable security definer
set search_path to 'public'
as $$
  select count(*)::int
    from public.vendor_profiles
   where user_id = p_user_id;
$$;

grant execute on function public.user_listing_count(uuid) to authenticated;

-- Server-side enforcement, self-serve inserts only (admin seeding
-- and service-role flows — e.g. claim-listing stubs — are exempt
-- because auth.uid() is null or differs from user_id there).
create or replace function public.enforce_listing_cap()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cap int;
begin
  if new.user_id is null or auth.uid() is distinct from new.user_id then
    return new;
  end if;
  v_cap := public.user_listing_cap(new.user_id);
  if v_cap is not null
     and public.user_listing_count(new.user_id) >= v_cap then
    raise exception 'listing_cap_reached: your plan allows % listing(s). Upgrade to add more.', v_cap;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_listing_cap on public.vendor_profiles;
create trigger trg_enforce_listing_cap
  before insert on public.vendor_profiles
  for each row execute function public.enforce_listing_cap();

-- ============================================================
-- 4. HILUX (AI employee) is Premium-only
-- ============================================================

-- Forces hilux_enabled off for any profile not on Premium. Also
-- auto-disables when the Stripe webhook downgrades the tier, since
-- it fires on every profiles write that touches these columns.
create or replace function public.enforce_hilux_premium()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.hilux_enabled = true
     and coalesce(new.subscription_tier, 'free') <> 'studio'
     and coalesce(new.unlimited_listings, false) = false then
    new.hilux_enabled := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_hilux_premium on public.profiles;
create trigger trg_enforce_hilux_premium
  before insert or update of hilux_enabled, subscription_tier on public.profiles
  for each row execute function public.enforce_hilux_premium();

-- One-time sweep: anyone currently running HILUX below Premium
-- loses it (spec: AI employee is a Premium feature).
update public.profiles
   set hilux_enabled = false
 where hilux_enabled = true
   and coalesce(subscription_tier, 'free') <> 'studio'
   and coalesce(unlimited_listings, false) = false;

-- ============================================================
-- 5. V2V (partner) messaging requires Pro or Premium to initiate
-- ============================================================

-- Existing threads keep working (replies aren't gated); only
-- STARTING a new conversation requires Pro+.
create or replace function public.find_or_create_partner_thread(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_a uuid; v_b uuid; v_id uuid;
begin
  if v_me is null then raise exception 'unauthorized'; end if;
  if p_other_user_id is null then raise exception 'missing recipient'; end if;
  if v_me = p_other_user_id then raise exception 'cannot message yourself'; end if;

  if not exists (
    select 1 from public.profiles
    where id = v_me and role = 'vendor' and application_status = 'approved'
  ) then
    raise exception 'caller is not an approved vendor';
  end if;

  -- V2V initiation is a Pro/Premium feature. Existing threads are
  -- unaffected — this RPC only runs when starting a conversation.
  if not exists (
    select 1 from public.profiles
    where id = v_me
      and (subscription_tier in ('pro', 'studio')
           or unlimited_listings = true)
  ) then
    raise exception 'v2v_requires_pro: vendor-to-vendor messaging is available on the Pro plan and up';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_other_user_id and role = 'vendor' and application_status = 'approved'
  ) then
    raise exception 'recipient is not an approved vendor';
  end if;

  if v_me < p_other_user_id then v_a := v_me; v_b := p_other_user_id;
  else v_a := p_other_user_id; v_b := v_me; end if;

  insert into public.vendor_partner_threads (user_a_id, user_b_id, last_message_at)
  values (v_a, v_b, now())
  on conflict (user_a_id, user_b_id)
    do update set last_message_at = vendor_partner_threads.last_message_at
  returning id into v_id;

  return v_id;
end
$$;
