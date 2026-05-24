-- Fix subscription state drift: active paying vendors whose
-- profile.stripe_subscription_id is null. Root cause: the PR #789
-- backfill copied state at the moment it ran, but any subscription
-- created BEFORE PR #789 deployed wrote sub_id only to vendor_profiles
-- (the old code path) and was missed.
--
-- Symptom: the customer portal deep-link to "switch plan" can't fire
-- (it gates on profile.stripe_subscription_id), so the user lands on
-- the portal home / Manage billing page instead of the plan-confirm
-- flow.
--
-- Fix here: copy the sub_id from the vendor's highest-tier listing
-- back to their profile. Also set monthly_grant from the catalog so
-- the usage page stops showing 0 grant for an active sub.

update public.profiles p
   set stripe_subscription_id = sub.sub_id,
       monthly_grant = case
         when p.monthly_grant > 0 then p.monthly_grant
         else coalesce(pkg.credits, 0)
       end
  from (
    select vp.user_id, vp.stripe_subscription_id as sub_id
    from public.vendor_profiles vp
    where vp.stripe_subscription_id is not null
  ) sub
  left join public.vendor_credit_packages pkg
    on pkg.kind = 'subscription' and pkg.active = true
  where p.id = sub.user_id
    and p.stripe_subscription_id is null
    and p.subscription_status in ('active', 'trialing')
    and p.subscription_tier in ('starter', 'pro', 'studio')
    and pkg.tier = p.subscription_tier;
