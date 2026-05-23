-- Enforce per-tier listing caps on vendor_profiles INSERT.
--
-- The subscription page promises Free/Starter=1 listing, Pro=5,
-- Studio=unlimited. Until this trigger, nothing in the DB or app
-- actually enforced that — a free vendor could spam unlimited
-- vendor_profiles rows via the listing wizard. Direct revenue leak.
--
-- Design:
--   1. user_listing_cap(user_id) -> int | null
--      Returns the cap based on:
--        (a) profiles.unlimited_listings flag — grandfathered
--            whitelist for early vendors. Wins over everything.
--            Returns NULL meaning "no cap".
--        (b) Highest subscription_tier across the user's
--            vendor_profiles rows (tier ranking: studio > pro >
--            starter > free). Default 'free' if no listings exist
--            yet (= first-listing case).
--      Cap table:
--        free, starter -> 1
--        pro           -> 5
--        studio        -> NULL (unlimited)
--
--   2. tg_vendor_profiles_enforce_listing_cap (BEFORE INSERT)
--      Compares COUNT(existing) to cap. Raises
--      'listing_cap_exceeded' if would-be count > cap.
--
-- Bypass paths:
--   - service_role (edge functions, scheduled jobs, admin bulk
--     import) — never enforced. The admin-bulk-import-vendors
--     function needs to insert dozens at a time for onboarding.
--   - is_admin() — admin moderation flow can add listings to
--     any vendor regardless of tier.
--
-- Existing vendors with more listings than their current cap
-- (e.g. the 3 test accounts with 35 listings between them) are
-- NOT affected — this fires on INSERT only. They keep what they
-- have; the cap just blocks NEW inserts.

create or replace function public.user_listing_cap(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_unlimited boolean;
  v_max_tier text;
begin
  -- Grandfathered unlimited override.
  select unlimited_listings into v_unlimited
    from public.profiles
   where id = p_user_id;
  if v_unlimited = true then
    return null;  -- unlimited
  end if;

  -- Effective tier = max across all this user's listings.
  -- (Multi-listing model: a user with 5 listings has ONE subscription
  -- at the account level; the tier is duplicated onto each
  -- vendor_profiles row by stripe-webhook. Picking max defends
  -- against drift.)
  select subscription_tier into v_max_tier
    from public.vendor_profiles
   where user_id = p_user_id
   order by case subscription_tier
     when 'studio'  then 4
     when 'pro'     then 3
     when 'starter' then 2
     when 'free'    then 1
     else 0
   end desc
   limit 1;

  v_max_tier := coalesce(v_max_tier, 'free');

  if    v_max_tier = 'studio'  then return null;  -- unlimited
  elsif v_max_tier = 'pro'     then return 5;
  elsif v_max_tier = 'starter' then return 1;
  else                              return 1;     -- free
  end if;
end;
$$;

create or replace function public.tg_vendor_profiles_enforce_listing_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer;
  v_count integer;
begin
  -- service_role + admin bypass: bulk import, moderation tools.
  if coalesce((select auth.role()), '') = 'service_role'
     or public.is_admin() then
    return new;
  end if;

  v_cap := public.user_listing_cap(new.user_id);
  if v_cap is null then
    return new;  -- unlimited (studio or grandfathered)
  end if;

  select count(*) into v_count
    from public.vendor_profiles
   where user_id = new.user_id;

  if v_count >= v_cap then
    raise exception
      'listing_cap_exceeded: your current plan allows % listing(s), you already have %',
      v_cap, v_count
      using errcode = 'P0001',
            hint = 'Upgrade your plan to add more listings.';
  end if;

  return new;
end;
$$;

drop trigger if exists vendor_profiles_enforce_listing_cap
  on public.vendor_profiles;
create trigger vendor_profiles_enforce_listing_cap
  before insert on public.vendor_profiles
  for each row
  execute function public.tg_vendor_profiles_enforce_listing_cap();
