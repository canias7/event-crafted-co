-- Sidebar plan label uses postgres_changes UPDATE events on
-- vendor_profiles to live-flip when the Stripe webhook writes a new
-- subscription_tier. Realtime is per-table opt-in; add the table to
-- the supabase_realtime publication so the subscription delivers.
-- RLS still gates which clients receive the event (vendor sees only
-- their own row).
alter publication supabase_realtime add table public.vendor_profiles;
