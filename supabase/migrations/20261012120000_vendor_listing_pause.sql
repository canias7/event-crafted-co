-- Vendors can pause a listing (owner's call, Oct 2026). While paused_at is
-- set the listing stays approved and its page still loads, but it drops
-- out of the directory, search, Explore and city/category pages, and its
-- page says it isn't taking new inquiries. The owner sets and clears it
-- through the existing "vendor_profiles owner update" policy.
alter table public.vendor_profiles
  add column if not exists paused_at timestamptz;

comment on column public.vendor_profiles.paused_at is
  'When the vendor paused this listing; null = live. Paused listings are hidden from browsing and refuse new inquiries.';
