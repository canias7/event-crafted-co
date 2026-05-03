-- Reviews with photos: hosts attach images to a review they leave on a
-- vendor's profile. Stored as a jsonb array of public storage URLs on
-- the review row (mirrors the messages.attachments pattern); files
-- live in a public storage bucket scoped per host folder.

alter table public.reviews
  add column if not exists photo_urls jsonb not null default '[]'::jsonb;

-- Public bucket so vendor profile pages render thumbnails to anonymous
-- visitors. Owner-folder write enforced by storage policies.
insert into storage.buckets (id, name, public)
values ('review-photos', 'review-photos', true)
on conflict (id) do nothing;

create policy "review photos public read"
  on storage.objects for select
  using (bucket_id = 'review-photos');

create policy "review photos owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "review photos owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
