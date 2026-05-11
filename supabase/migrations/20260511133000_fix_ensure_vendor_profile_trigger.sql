-- Earlier today I dropped vendor_profiles_user_id_unique to support
-- multiple listings per user. The ensure_vendor_profile_for_vendor_role
-- trigger was still relying on `ON CONFLICT (user_id) WHERE user_id IS
-- NOT NULL DO NOTHING`, which references that index. Without it the
-- trigger throws 42P10 and breaks any path that flips profiles.role
-- to 'vendor' (signup with vendor intent + first-listing creation
-- for an existing host).
--
-- Rewriting to use a NOT EXISTS guard instead so the same "ensure
-- the user has at least one vendor_profiles row" guarantee holds
-- without depending on the dropped index.

create or replace function public.ensure_vendor_profile_for_vendor_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_name text;
  v_category text;
begin
  if new.role = 'vendor' and (TG_OP = 'INSERT' or old.role is distinct from new.role) then
    select
      raw_user_meta_data->>'vendor_business_name',
      raw_user_meta_data->>'vendor_category'
      into v_business_name, v_category
    from auth.users
    where id = new.id;

    if not exists (select 1 from public.vendor_profiles where user_id = new.id) then
      insert into public.vendor_profiles (user_id, application_status, business_name, category)
      values (new.id, 'draft', v_business_name, v_category);
    end if;
  end if;
  return new;
end;
$$;
