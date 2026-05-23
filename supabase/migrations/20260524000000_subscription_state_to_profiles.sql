-- Move subscription + Stripe-customer state from vendor_profiles
-- (per-listing) to profiles (per-user). Vendors are billed per
-- account, so per-listing state was wrong on day one and caused
-- the multi-listing tier drift the audit flagged.
--
-- New columns on profiles mirror what was on vendor_profiles, plus
-- the period bookkeeping columns the audit also flagged as missing
-- writes (#3 in the report). vendor_profiles columns stay around
-- for a soak period — readers will migrate over in this same PR;
-- the columns get dropped in a follow-up after a week of live writes.

alter table public.profiles
  add column if not exists subscription_tier text not null default 'free',
  add column if not exists subscription_status text,
  add column if not exists subscription_current_period_end timestamptz,
  add column if not exists subscription_cancel_at_period_end boolean not null default false,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists monthly_grant integer not null default 0,
  add column if not exists period_started_at timestamptz,
  add column if not exists period_ends_at timestamptz;

-- One Stripe Customer per profile. Partial so existing nulls don't
-- collide. New writers go via profiles, so this constraint kills
-- duplicate-customer creation (audit #6) by construction.
create unique index if not exists profiles_stripe_customer_id_key
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- Backfill: take max(tier) across each user's listings (same
-- ranking the listing/image cap functions already use). Pull the
-- customer id + period bookkeeping from whichever listing has them
-- — that's the listing checkout was fired against, so it's the
-- canonical Stripe Customer for the user.
with ranked as (
  select
    vp.user_id,
    vp.subscription_tier,
    vp.subscription_status,
    vp.subscription_current_period_end,
    vp.subscription_cancel_at_period_end,
    vp.stripe_customer_id,
    vp.stripe_subscription_id,
    row_number() over (
      partition by vp.user_id
      order by case vp.subscription_tier
        when 'studio'  then 4
        when 'pro'     then 3
        when 'starter' then 2
        when 'free'    then 1
        else 0
      end desc, vp.stripe_customer_id is null asc
    ) as rn
  from public.vendor_profiles vp
  where vp.user_id is not null
)
update public.profiles p
   set subscription_tier = r.subscription_tier,
       subscription_status = r.subscription_status,
       subscription_current_period_end = r.subscription_current_period_end,
       subscription_cancel_at_period_end = coalesce(r.subscription_cancel_at_period_end, false),
       stripe_customer_id = r.stripe_customer_id,
       stripe_subscription_id = r.stripe_subscription_id
  from ranked r
 where p.id = r.user_id
   and r.rn = 1;

-- Cap functions read from profiles now. Schema stays per-user.
-- Listing cap multi-row stuff is gone because there's exactly one
-- profile row per user.

create or replace function public.user_listing_cap(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
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

  if    v_tier = 'studio'  then return 5;
  elsif v_tier = 'pro'     then return 5;
  elsif v_tier = 'starter' then return 1;
  else                          return 1;
  end if;
end;
$$;

create or replace function public.user_image_cap(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
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

  if    v_tier = 'studio'  then return 2000;
  elsif v_tier = 'pro'     then return 1000;
  elsif v_tier = 'starter' then return 250;
  else                          return 0;
  end if;
end;
$$;
