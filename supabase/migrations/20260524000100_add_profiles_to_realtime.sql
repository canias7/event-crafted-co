-- useVendorPlan now subscribes to public.profiles for
-- subscription_tier updates (after migration
-- 20260524000000_subscription_state_to_profiles moved the tier
-- per-user). Realtime is opt-in per table — add profiles so the
-- sidebar "Starter plan" label flips live the moment the Stripe
-- webhook writes a new tier. RLS still gates which clients see the
-- payload (each user sees only their own row).
alter publication supabase_realtime add table public.profiles;
