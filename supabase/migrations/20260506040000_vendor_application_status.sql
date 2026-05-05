-- Vendor application status. Until now, anyone who hit /vendor-apply
-- got their vendor_profile row immediately public on the directory —
-- the marketing copy promised hand review but nothing enforced it.
-- This migration adds the status column + RLS gate so unapproved
-- applications stay invisible until an admin acts.
--
-- Existing vendors (everyone in the table at apply-time of this
-- migration) get auto-marked 'approved' so the directory doesn't
-- empty out. New rows default to 'pending'.

alter table public.vendor_profiles
  add column if not exists application_status text not null
  default 'approved'
  check (application_status in ('pending', 'approved', 'rejected'));

-- Optional review fields: who reviewed + when + why-rejected (admin
-- can leave a note that may eventually surface on a "your app was
-- declined" screen for the vendor).
alter table public.vendor_profiles
  add column if not exists application_reviewed_at timestamptz,
  add column if not exists application_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists application_review_notes text;

-- Flip the default for future inserts so /vendor-apply puts new
-- rows in 'pending'. Existing rows already got 'approved' from
-- the column-add above.
alter table public.vendor_profiles
  alter column application_status set default 'pending';

-- Replace the wide-open public read policy with one that filters
-- to approved vendors. Owners can always see their own row
-- (regardless of status), and admins see everything.
drop policy if exists "vendor_profiles public read" on public.vendor_profiles;

create policy "vendor_profiles public read approved"
  on public.vendor_profiles for select
  using (
    application_status = 'approved'
    or auth.uid() = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Index the status so /admin/vendors filtering on pending is cheap.
create index if not exists vendor_profiles_status_idx
  on public.vendor_profiles (application_status, created_at desc);
