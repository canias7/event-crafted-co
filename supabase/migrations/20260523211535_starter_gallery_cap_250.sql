-- Starter gallery cap drops 500 -> 250. Pricing recal on the
-- vendor-storage curve: 500 was too generous for the $14.99 tier;
-- pulls the value gap closer to Pro (1,200) so the ladder reads
-- "double for a little more" between tiers.

create or replace function public.user_image_cap(p_user_id uuid)
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

  if    v_max_tier = 'studio'  then return 2000;
  elsif v_max_tier = 'pro'     then return 1200;
  elsif v_max_tier = 'starter' then return 250;
  else                              return 0;
  end if;
end;
$$;
