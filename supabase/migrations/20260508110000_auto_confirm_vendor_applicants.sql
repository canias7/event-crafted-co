-- Vendor applicants don't need email confirmation. Admin review is the
-- real gate, and the welcome email after approval doubles as proof of
-- email ownership. Skipping the confirm step lets us send a pure
-- "thanks, we'll review" email instead of a dangling "confirm your
-- account" CTA the user can never meaningfully complete.
--
-- handle_new_user already creates the host profile + pending vendor
-- profile from signup metadata. We extend it to also auto-confirm
-- vendor applicants by setting email_confirmed_at on the auth.users row.

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

    -- Vendor applicants are auto-confirmed: the email they receive is
    -- a thank-you with no CTA, and the welcome-on-approval email will
    -- prove email ownership before they actually sign in.
    -- (confirmed_at is GENERATED from email_confirmed_at, can't write
    -- to it directly — Postgres throws.)
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now())
     where id = new.id;
  end if;

  return new;
end;
$$;
