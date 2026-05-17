-- vendor_posts / reels / buzz used to join the author via the
-- vendor_id → vendor_profiles FK. Now that vendor_id is nullable
-- (posts are account-level, not listing-scoped), we need to join the
-- author via user_id → profiles instead so the public + global feeds
-- can resolve the author's display name + logo + approval status.

alter table public.vendor_posts
  add constraint vendor_posts_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.vendor_reels
  add constraint vendor_reels_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.vendor_buzz
  add constraint vendor_buzz_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
