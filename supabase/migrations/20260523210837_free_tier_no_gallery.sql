-- Gallery becomes a Starter+ feature. Free vendors can still keep
-- their listings (vendor-portfolios is unrestricted) but the
-- standalone /vendor/gallery surface is gated. Easiest enforcement:
-- drop the Free tier's image cap from 100 to 0 so any vendor-gallery
-- upload is rejected by the existing RLS RESTRICTIVE policy.

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
  elsif v_max_tier = 'starter' then return 500;
  else                              return 0;      -- free: no gallery access
  end if;
end;
$$;
