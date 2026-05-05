ALTER TABLE public.vendor_profiles
  ADD COLUMN IF NOT EXISTS instagram_handle text,
  ADD COLUMN IF NOT EXISTS tiktok_handle text,
  ADD COLUMN IF NOT EXISTS deposit_pct numeric,
  ADD COLUMN IF NOT EXISTS reschedule_window_days integer,
  ADD COLUMN IF NOT EXISTS policy_notes text;