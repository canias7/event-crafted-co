-- Move social content (posts / reels / buzz) from vendor-authored
-- to host-authored. Vendors now only manage listings (vendor_packages);
-- the entire content-creation surface is reframed as a host activity.
--
-- Strategy: blue/green schema swap. Create new neutral-named tables
-- alongside the vendor_* legacy tables, leave the legacy tables in
-- place as empty shells so the still-deployed prod app doesn't 500
-- on its vendor_posts/vendor_reels/vendor_buzz queries while this
-- branch is in review. A follow-up migration drops the legacy
-- tables after the new client lands in prod.
--
-- Data: wipe existing rows (5 total). Vendors authored them; there's
-- no host counterpart to migrate the authorship to.

delete from public.vendor_post_comment_likes;
delete from public.vendor_post_comments;
delete from public.vendor_posts;
delete from public.vendor_reels;
delete from public.vendor_buzz;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  caption text,
  created_at timestamptz not null default now()
);

create table public.reels (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  video_url text not null,
  thumbnail_url text,
  caption text,
  duration_seconds int,
  created_at timestamptz not null default now()
);

create table public.buzz (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.post_comment_likes (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index posts_author_created_idx
  on public.posts(author_user_id, created_at desc);
create index reels_author_created_idx
  on public.reels(author_user_id, created_at desc);
create index buzz_author_created_idx
  on public.buzz(author_user_id, created_at desc);
create index posts_created_idx on public.posts(created_at desc);
create index reels_created_idx on public.reels(created_at desc);
create index buzz_created_idx on public.buzz(created_at desc);
create index post_comments_post_idx
  on public.post_comments(post_id, created_at desc);
create index post_comment_likes_user_idx
  on public.post_comment_likes(user_id);

alter table public.posts enable row level security;
alter table public.reels enable row level security;
alter table public.buzz enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_comment_likes enable row level security;

-- Public read on all five — feeds are visible to anyone.
create policy "posts public read" on public.posts for select using (true);
create policy "reels public read" on public.reels for select using (true);
create policy "buzz public read" on public.buzz for select using (true);
create policy "post_comments public read" on public.post_comments for select using (true);
create policy "post_comment_likes public read" on public.post_comment_likes for select using (true);

-- Authoring posts/reels/buzz: caller must be a host (profiles.role)
-- and own the row. Vendors are explicitly blocked from authoring
-- this content per the product decision to make listings the only
-- vendor-side surface.
create policy "posts host insert" on public.posts for insert
  with check (
    author_user_id = (select auth.uid())
    and exists (select 1 from public.profiles
                 where id = (select auth.uid()) and role = 'host')
  );
create policy "posts author update" on public.posts for update
  using (author_user_id = (select auth.uid()))
  with check (author_user_id = (select auth.uid()));
create policy "posts author delete" on public.posts for delete
  using (author_user_id = (select auth.uid()));

create policy "reels host insert" on public.reels for insert
  with check (
    author_user_id = (select auth.uid())
    and exists (select 1 from public.profiles
                 where id = (select auth.uid()) and role = 'host')
  );
create policy "reels author update" on public.reels for update
  using (author_user_id = (select auth.uid()))
  with check (author_user_id = (select auth.uid()));
create policy "reels author delete" on public.reels for delete
  using (author_user_id = (select auth.uid()));

create policy "buzz host insert" on public.buzz for insert
  with check (
    author_user_id = (select auth.uid())
    and exists (select 1 from public.profiles
                 where id = (select auth.uid()) and role = 'host')
  );
create policy "buzz author update" on public.buzz for update
  using (author_user_id = (select auth.uid()))
  with check (author_user_id = (select auth.uid()));
create policy "buzz author delete" on public.buzz for delete
  using (author_user_id = (select auth.uid()));

-- Comments + likes: any authenticated user can engage (hosts and
-- vendors both — engagement isn't a host-only privilege).
create policy "post_comments author insert" on public.post_comments for insert
  with check (author_user_id = (select auth.uid()));
create policy "post_comments author update" on public.post_comments for update
  using (author_user_id = (select auth.uid()))
  with check (author_user_id = (select auth.uid()));
create policy "post_comments author delete" on public.post_comments for delete
  using (author_user_id = (select auth.uid()));

create policy "post_comment_likes user insert" on public.post_comment_likes for insert
  with check (user_id = (select auth.uid()));
create policy "post_comment_likes user delete" on public.post_comment_likes for delete
  using (user_id = (select auth.uid()));
