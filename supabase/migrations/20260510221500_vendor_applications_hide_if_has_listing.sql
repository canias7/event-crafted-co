-- Vendor Applications tab is the ACCOUNT review queue. Vendor
-- Listings tab is the LISTING review queue. Each vendor should only
-- appear in one at a time:
--   - In Applications while they're a fresh signup with no listing.
--   - In Listings once they've created their listing.
-- If a vendor has any vendor_profiles row, they've moved past the
-- application phase — hide them from Applications regardless of
-- profile.application_status.

create or replace function public.admin_list_vendor_applications(
  p_status text
)
returns table (
  id uuid,
  display_name text,
  application_status text,
  email text,
  business_name text,
  category text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    p.id,
    p.display_name,
    p.application_status,
    u.email,
    u.raw_user_meta_data->>'vendor_business_name' as business_name,
    u.raw_user_meta_data->>'vendor_category' as category
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'vendor'
    and p.application_status = p_status
    and not exists (
      select 1 from public.vendor_profiles vp where vp.user_id = p.id
    )
    and public.is_admin()
  order by u.created_at desc;
$$;

-- Backfill: any vendor whose listing already exists is no longer
-- "pending an account decision" — auto-approve their account so the
-- two tabs stay clean.
update public.profiles p
   set application_status = 'approved'
 where role = 'vendor'
   and application_status = 'pending'
   and exists (
     select 1 from public.vendor_profiles vp where vp.user_id = p.id
   );
