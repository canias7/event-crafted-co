-- #3 — Composers (vendor_posts / vendor_reels / vendor_buzz) used to
-- accept inserts from any authenticated user when vendor_id was null,
-- because the WITH CHECK only required `user_id = auth.uid()` in that
-- branch. A host could insert rows into the table — the public feeds
-- still filter by `role = vendor` so the content stays hidden, but
-- the table fills with junk. Tighten the policy to require the author
-- be a vendor profile.
--
-- #7 — vendor_portfolio_images.display_order is assigned client-side
-- in the uploader, which races on concurrent uploads (two uploads in
-- flight both see the same max). Add a BEFORE INSERT trigger that
-- overwrites whatever the client sent with MAX(display_order) + 1
-- computed under an advisory xact lock scoped to the vendor_id, so
-- concurrent inserts serialize and end up with monotonic ordering.

-- ---------- #3 ----------

drop policy if exists "vendor_posts insert own" on public.vendor_posts;
create policy "vendor_posts insert own"
  on public.vendor_posts
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'vendor'
    )
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
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'vendor'
    )
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
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'vendor'
    )
    and (
      vendor_id is null
      or exists (
        select 1 from public.vendor_profiles vp
        where vp.id = vendor_buzz.vendor_id
          and vp.user_id = (select auth.uid())
      )
    )
  );

-- ---------- #7 ----------

create or replace function public.tg_vendor_portfolio_images_default_order()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_next int;
begin
  -- Serialize concurrent inserts on the same vendor_id so two
  -- uploaders racing for the same display_order can't collide.
  -- Lock releases automatically on commit/rollback.
  perform pg_advisory_xact_lock(
    hashtextextended('vendor_portfolio_images:' || new.vendor_id::text, 0)
  );

  select coalesce(max(display_order) + 1, 0)
    into v_next
    from public.vendor_portfolio_images
    where vendor_id = new.vendor_id;

  new.display_order := v_next;
  return new;
end
$$;

drop trigger if exists vendor_portfolio_images_default_order
  on public.vendor_portfolio_images;

create trigger vendor_portfolio_images_default_order
  before insert on public.vendor_portfolio_images
  for each row
  execute function public.tg_vendor_portfolio_images_default_order();
