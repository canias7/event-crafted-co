-- HILUX voice training: an array of the vendor's own past replies
-- that HILUX uses as style examples in its system prompt. The vendor
-- pastes 3-5 messages they actually sent; HILUX learns the cadence,
-- vocab, and tone. Bounded to ~5 samples / 8000 chars total to keep
-- prompt size sane.

alter table public.vendor_profiles
  add column if not exists hilux_voice_samples text[] not null default '{}'::text[];
