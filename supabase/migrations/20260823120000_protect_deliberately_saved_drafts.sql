-- The hourly orphan sweep deletes any 'draft' listing with zero photos
-- older than an hour, on the assumption that such a row can only be a
-- tab closed mid-submit. That assumption no longer holds: the app's
-- "+ Listing" flow creates a bare draft row and hands it to the editor,
-- and the web wizard now has an explicit "Save draft". Both produce
-- photo-less drafts a vendor fully intends to come back to.
--
-- draft_saved_at marks a draft the vendor deliberately saved. The sweep
-- skips those and keeps collecting genuinely abandoned rows.
alter table public.vendor_profiles
  add column if not exists draft_saved_at timestamptz;

comment on column public.vendor_profiles.draft_saved_at is
  'Set when a vendor explicitly saves a listing as a draft. Non-null exempts the row from the orphan-draft sweep.';

create or replace function public.find_orphan_draft_listings(p_older_than_minutes integer DEFAULT 60)
 returns uuid[]
 language sql
 security definer
 set search_path to 'public'
as $function$
  select coalesce(array_agg(vp.id), '{}')
  from public.vendor_profiles vp
  where vp.application_status = 'draft'
    and vp.draft_saved_at is null
    and vp.created_at < (now() - (p_older_than_minutes || ' minutes')::interval)
    and not exists (
      select 1 from public.vendor_portfolio_images vpi
      where vpi.vendor_id = vp.id
    );
$function$;
