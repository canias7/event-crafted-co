-- Posts, reels, and buzz are account-level content (one feed per
-- vendor account), not tied to any specific listing. The previous
-- INSERT policies required vendor_id to reference a row in
-- vendor_profiles owned by the caller, which blocked every composer
-- since the frontend never set vendor_id. Allow vendor_id IS NULL,
-- and still validate listing ownership when it IS set (in case a
-- future composer wants to scope a post to a specific listing).

drop policy if exists "vendor_posts insert own" on public.vendor_posts;
create policy "vendor_posts insert own"
  on public.vendor_posts
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      vendor_id is null
      or exists (
        select 1 from public.vendor_profiles vp
        where vp.id = vendor_posts.vendor_id
          and vp.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "vendor_reels insert own" on public.vendor_reels;
create policy "vendor_reels insert own"
  on public.vendor_reels
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      vendor_id is null
      or exists (
        select 1 from public.vendor_profiles vp
        where vp.id = vendor_reels.vendor_id
          and vp.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "vendor_buzz insert own" on public.vendor_buzz;
create policy "vendor_buzz insert own"
  on public.vendor_buzz
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      vendor_id is null
      or exists (
        select 1 from public.vendor_profiles vp
        where vp.id = vendor_buzz.vendor_id
          and vp.user_id = (select auth.uid())
      )
    )
  );
