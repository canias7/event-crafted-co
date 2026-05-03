-- Review moderation: admin can hide a review (sets hidden_at). Public reads
-- now exclude hidden rows; the host (author) and the vendor still see them
-- so they're aware their content was moderated.

alter table public.reviews
  add column hidden_at timestamptz,
  add column hidden_reason text;

-- Tighten the public-read policy: hidden reviews aren't visible to anyone
-- except the author and the responding vendor.
drop policy if exists "reviews public read" on public.reviews;

create policy "reviews public read"
  on public.reviews for select
  using (
    hidden_at is null
    or auth.uid() = host_id
    or exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

-- Admin can update reviews (moderation: set/clear hidden_at)
create policy "reviews admin update"
  on public.reviews for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
