-- Move the vendor email-auto-confirm from signup time to approval time.
--
-- Previously: handle_new_user set email_confirmed_at = now() for any
-- new auth user with vendor metadata. That fired BEFORE GoTrue checked
-- whether to send the confirmation email, so GoTrue saw the user as
-- already confirmed and skipped the email entirely. It also gave the
-- vendor a live client session at signup, letting them browse the
-- vendor portal before admin approval.
--
-- Now: handle_new_user just inserts the host profile + pending vendor
-- profile and stops. GoTrue queues its normal confirmation email,
-- which the auth-email-hook intercepts and renders as "Thanks for
-- applying" copy. The user has no session because email is unconfirmed
-- and the email itself has no confirm link.
--
-- When admin approves the application,
-- tg_vendor_profiles_role_promote now sets email_confirmed_at so the
-- vendor can finally sign in. The welcome-on-approval email
-- (send-transactional-email kind='vendor_approved' from the admin
-- panel) doubles as proof of email ownership.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_business text := new.raw_user_meta_data->>'vendor_business_name';
  v_category text := new.raw_user_meta_data->>'vendor_category';
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'host',
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  if v_business is not null and v_category is not null then
    insert into public.vendor_profiles (user_id, business_name, category, application_status)
    values (new.id, v_business, v_category, 'pending');
  end if;

  return new;
end;
$$;

create or replace function public.tg_vendor_profiles_role_promote()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.application_status = 'approved'
     and (old.application_status is distinct from 'approved')
  then
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now())
     where id = new.user_id;
  end if;

  return new;
end;
$$;
