-- Drop the stale HILUX columns left on vendor_profiles after the
-- per-listing → per-profile migration (20260521200000). The data
-- was copied up to profiles back then, but the source columns
-- weren't dropped, so reads against vendor_profiles.hilux_enabled
-- have been returning frozen pre-migration state.

alter table public.vendor_profiles drop column if exists hilux_enabled;
alter table public.vendor_profiles drop column if exists hilux_instructions;
alter table public.vendor_profiles drop column if exists hilux_voice_samples;
