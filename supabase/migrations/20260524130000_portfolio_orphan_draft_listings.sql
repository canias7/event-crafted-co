-- Extend orphan cleanup to also delete stale draft listings.
--
-- The wizard now creates rows as 'draft' and only flips to
-- 'pending' after photos + FAQs are committed (see
-- ListingWizardModal handleSubmit step 4). So any old draft with
-- no photos never finished its initial submit — closed-tab,
-- crashed browser, lost connection. The cleanup-portfolio-orphans
-- edge function picks these up alongside orphan storage objects.

create or replace function public.find_orphan_draft_listings(
  p_older_than_minutes int default 60
)
returns uuid[]
language sql
security definer
set search_path = public
as $$
  select coalesce(array_agg(vp.id), '{}')
  from public.vendor_profiles vp
  where vp.application_status = 'draft'
    and vp.created_at < (now() - (p_older_than_minutes || ' minutes')::interval)
    and not exists (
      select 1 from public.vendor_portfolio_images vpi
      where vpi.vendor_id = vp.id
    );
$$;

revoke all on function public.find_orphan_draft_listings(int)
  from public, anon, authenticated;
grant execute on function public.find_orphan_draft_listings(int)
  to service_role;
