-- admin_list_vendor_applications was originally written under the
-- assumption that a vendor only gets a vendor_profiles row AFTER admin
-- approval. The auto-listing-on-signup flow (PR #150 era) broke that
-- assumption — every fresh vendor now has a stub vendor_profiles row,
-- so the NOT EXISTS filter was excluding every pending applicant from
-- the admin's Pending tab.
--
-- Drop that filter. The application_status check is the actual signal
-- for "needs admin review". The Listings tab has its own separate
-- publish-ready filter so the two tabs don't duplicate work.

create or replace function public.admin_list_vendor_applications(p_status text)
returns table(
  id uuid,
  display_name text,
  application_status text,
  email text,
  business_name text,
  category text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.application_status,
    u.email::text,
    u.raw_user_meta_data->>'vendor_business_name' as business_name,
    u.raw_user_meta_data->>'vendor_category' as category
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'vendor'
    and p.application_status = p_status
    and public.is_admin()
  order by u.created_at desc;
$$;
