-- Seed profiles.business_name from raw_user_meta_data.vendor_business_name
-- on signup so freshly approved vendors land on /vendor/me with the brand
-- card already showing the name they typed at signup (instead of "Vendor"
-- until they manually edit identity).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_intended_role text := new.raw_user_meta_data->>'intended_role';
  v_business      text := new.raw_user_meta_data->>'vendor_business_name';
  v_category      text := new.raw_user_meta_data->>'vendor_category';
  v_role          text := 'host';
  v_app_status    text := 'approved';
  v_is_vendor     boolean := false;
begin
  if v_intended_role = 'vendor'
     or (v_business is not null and v_category is not null) then
    v_role := 'vendor';
    v_app_status := 'pending';
    v_is_vendor := true;
  end if;

  insert into public.profiles (
    id, role, display_name, business_name, application_status, onboarded_at
  )
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    case when v_is_vendor then nullif(trim(coalesce(v_business, '')), '') else null end,
    v_app_status,
    case when v_is_vendor then null else now() end
  );

  -- Auto-confirm hosts so signup → instant access. Vendors stay
  -- unconfirmed until tg_profiles_role_promote (or
  -- tg_vendor_profiles_role_promote) sets email_confirmed_at on
  -- admin approval.
  if not v_is_vendor then
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now())
     where id = new.id;
  end if;

  return new;
end;
$$;
