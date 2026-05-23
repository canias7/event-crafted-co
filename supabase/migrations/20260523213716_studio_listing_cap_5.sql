-- Studio listing cap drops from unlimited -> 5. Pricing reset:
-- 5 listings on the $99 tier is the same as Pro's per-listing
-- generosity at a higher AI-credit + storage allotment, instead of
-- the "unlimited" outlier. profiles.unlimited_listings remains the
-- escape hatch for whitelisted accounts that need true unlimited.

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
  select unlimited_listings into v_unlimited
    from public.profiles
   where id = p_user_id;
  if v_unlimited = true then
    return null;
  end if;

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

  if    v_max_tier = 'studio'  then return 5;
  elsif v_max_tier = 'pro'     then return 5;
  elsif v_max_tier = 'starter' then return 1;
  else                              return 1;
  end if;
end;
$$;
