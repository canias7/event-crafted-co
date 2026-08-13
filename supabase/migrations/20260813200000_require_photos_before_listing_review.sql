-- Listings must have photos before they can sit in the review queue.
-- Reported: a listing was "Under review" with zero photos, which admin
-- can never approve. Two producers made that possible:
--
--   1. apply_as_vendor created the vendor's first listing directly at
--      application_status='pending' — in review from birth, empty.
--   2. Nothing server-side stopped any path from moving a photo-less
--      listing into review; only client-side validation guarded it.
--
-- Fixes, in order: first listings start as drafts; a BEFORE trigger
-- demotes any INSERT at (or transition into) pending/submitted back to
-- draft when the listing has fewer than 3 portfolio photos (matching
-- the client's MIN_PHOTOS); existing photo-less in-review rows are
-- swept back to draft.

-- 1. First listing is a draft workspace, not a submission.
create or replace function public.apply_as_vendor(p_business_name text, p_category text)
returns public.vendor_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.vendor_profiles;
  v_new public.vendor_profiles;
begin
  if v_user_id is null then
    raise exception 'must be authenticated';
  end if;

  if coalesce(trim(p_business_name), '') = '' then
    raise exception 'business_name required';
  end if;
  if coalesce(trim(p_category), '') = '' then
    raise exception 'category required';
  end if;

  select * into v_existing
    from public.vendor_profiles
   where user_id = v_user_id
   limit 1;
  if found then
    return v_existing;
  end if;

  insert into public.vendor_profiles (
    user_id, business_name, category, application_status
  ) values (
    v_user_id, trim(p_business_name), trim(p_category), 'draft'
  )
  returning * into v_new;

  return v_new;
end;
$$;

-- 2. Server-side guard: entering review requires >= 3 photos. Demotes
-- to draft instead of raising so no unknown provisioning path can
-- error out; legitimate publishes are client-validated first and pass.
create or replace function public.enforce_listing_photos_before_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.application_status in ('pending', 'submitted')
     and (tg_op = 'INSERT'
          or old.application_status is distinct from new.application_status)
  then
    if (select count(*) from public.vendor_portfolio_images i
         where i.vendor_id = new.id) < 3 then
      new.application_status := 'draft';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_require_photos_for_review on public.vendor_profiles;
create trigger trg_require_photos_for_review
  before insert or update of application_status on public.vendor_profiles
  for each row execute function public.enforce_listing_photos_before_review();

-- 3. Sweep: photo-less listings currently sitting in review go back to
-- draft (admin can never approve them anyway).
update public.vendor_profiles vp
   set application_status = 'draft'
 where vp.application_status in ('pending', 'submitted')
   and (select count(*) from public.vendor_portfolio_images i
         where i.vendor_id = vp.id) < 3;
