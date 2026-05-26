-- Dedicated public bucket for vendor brand logos. Path layout:
-- <vendor_id>/<filename>. The existing vendor-portfolios bucket
-- gates writes on vendor_team_members membership, which excludes
-- vendors who own the listing but aren't yet in the team_members
-- table (the most common case for solo vendors); the policies
-- below also accept vendor_profiles.user_id = auth.uid() so
-- single-operator vendors can upload their own logo.

insert into storage.buckets (id, name, public)
values ('vendor-logos', 'vendor-logos', true)
on conflict (id) do update set public = true;

drop policy if exists "vendor logos owner insert" on storage.objects;
create policy "vendor logos owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vendor-logos'
    and (
      exists (
        select 1 from public.vendor_profiles vp
        where vp.id::text = (storage.foldername(name))[1]
          and vp.user_id = auth.uid()
      )
      or public.is_vendor_member(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "vendor logos owner update" on storage.objects;
create policy "vendor logos owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'vendor-logos'
    and (
      exists (
        select 1 from public.vendor_profiles vp
        where vp.id::text = (storage.foldername(name))[1]
          and vp.user_id = auth.uid()
      )
      or public.is_vendor_member(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "vendor logos owner delete" on storage.objects;
create policy "vendor logos owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vendor-logos'
    and (
      exists (
        select 1 from public.vendor_profiles vp
        where vp.id::text = (storage.foldername(name))[1]
          and vp.user_id = auth.uid()
      )
      or public.is_vendor_member(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "vendor logos public read" on storage.objects;
create policy "vendor logos public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'vendor-logos');
