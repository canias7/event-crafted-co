-- Gallery is now available to every vendor tier, including Free.
--
-- Previously the gallery was a Starter+ feature: the nav entry was
-- hidden for Free, the page rendered a paywall, and user_image_cap
-- returned 0 for free tier (a hard server-side block enforced by the
-- vendor-gallery RLS cap). With the gallery opened up to all tiers,
-- free at 0 would let vendors see the gallery but upload nothing.
--
-- Free is uncapped for now (returns null = unlimited, same sentinel as
-- grandfathered/unlimited_listings accounts). Paid-tier caps are
-- unchanged. The tier caps will be revisited when the plans are
-- restructured.

create or replace function public.user_image_cap(p_user_id uuid)
 returns integer
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
  else                          return null;  -- free: uncapped for now
  end if;
end;
$function$;
