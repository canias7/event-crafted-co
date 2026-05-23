-- Pro gallery cap drops 1,200 -> 1,000. Round number for the
-- $39/mo tier; keeps the 4x multiplier vs Starter (250) and the
-- 2x relationship to Studio (2,000).

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
  elsif v_max_tier = 'pro'     then return 1000;
  elsif v_max_tier = 'starter' then return 250;
  else                              return 0;
  end if;
end;
$$;
