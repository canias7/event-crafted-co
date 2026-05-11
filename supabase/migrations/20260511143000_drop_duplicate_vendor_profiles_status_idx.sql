-- vendor_profiles has two identical indexes on (application_status,
-- created_at DESC) — vendor_profiles_status_idx and the redundant
-- vendor_profiles_application_status_idx. Drop the later-named one
-- (keep the shorter, original name); the planner can pick either,
-- and every write paid the cost of maintaining both.

drop index if exists public.vendor_profiles_application_status_idx;
