-- Drop the implicit "your account is also an application" semantics.
-- Until now, handle_new_user inserted vendor_profiles rows with
-- application_status='pending' if signup metadata had business name +
-- category. That made the row appear on the admin Vendor Applications
-- tab immediately after signup. The product rule is now: signing up
-- ≠ submitting a listing. Listings only enter the review queue when
-- the vendor hits Publish in the listing builder.
--
-- Change: keep the insert (so the vendor has a row to fill in later
-- without a chicken-and-egg login problem) but use status='draft'.
-- Draft rows don't show on the admin Applications tab, don't show
-- on the marketplace, and don't surface as a "listing" anywhere.
-- The listing builder Publish action flips draft → pending; admin
-- approval flips pending → approved.

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
    values (new.id, v_business, v_category, 'draft');

    -- Auto-confirm so the vendor can sign in immediately. There's no
    -- "thank you, we're reviewing your application" loop anymore —
    -- they can use the app the moment they sign up, they just won't
    -- be in the marketplace until they fill in the listing.
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now())
     where id = new.id;
  end if;

  return new;
end;
$$;

-- Reset any previously auto-created rows that the admin approved
-- sight-unseen back to 'draft' if they don't have any listing data
-- yet. Approved rows with real listing data stay approved.
update public.vendor_profiles
   set application_status = 'draft'
 where application_status in ('pending', 'approved')
   and (location is null
        or bio is null
        or base_price_cents is null
        or base_price_cents <= 0);
