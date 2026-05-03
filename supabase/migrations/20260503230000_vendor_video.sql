-- Vendor intro video: optional URL on vendor_profiles. Frontend renders
-- a player (YouTube / Vimeo embed if recognized, else <video> tag).
-- Stays nullable; vendors without a video just don't get the section.

alter table public.vendor_profiles
  add column if not exists intro_video_url text;
