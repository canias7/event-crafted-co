-- Vendor onboarding nudges: re-engage vendors stuck mid-setup. The
-- VendorOnboardingPage walks them through Polish → Pricing → Photos,
-- but most abandon at 30%. A daily scanner finds vendors created N+
-- days ago whose profile is still incomplete and emails a nudge with
-- a deep link back to the wizard.
--
-- "Incomplete" = at least one of:
--   - bio is null/empty
--   - portfolio_summary is null/empty
--   - location is null
--   - no active vendor_packages
--   - no vendor_portfolio_images
--
-- Cooldown: nudge_sent_at column prevents re-spamming. Default cooldown
-- is 7 days; tunable via the function arg.

alter table public.vendor_profiles
  add column if not exists onboarding_nudge_sent_at timestamptz;

create or replace function public.enqueue_vendor_onboarding_nudges(
  p_min_age_days int default 3,
  p_cooldown_days int default 7
)
returns table (
  vendor_id uuid,
  user_id uuid,
  business_name text,
  email text,
  missing_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  with eligible as (
    update public.vendor_profiles vp
    set onboarding_nudge_sent_at = now()
    where vp.created_at < (now() - make_interval(days => p_min_age_days))
      and (
        vp.onboarding_nudge_sent_at is null
        or vp.onboarding_nudge_sent_at
           < (now() - make_interval(days => p_cooldown_days))
      )
      -- At least one signal of incompleteness
      and (
        coalesce(trim(vp.bio), '') = ''
        or coalesce(trim(vp.portfolio_summary), '') = ''
        or vp.location is null
        or not exists (
          select 1 from public.vendor_packages
          where vendor_id = vp.id and is_active = true
        )
        or not exists (
          select 1 from public.vendor_portfolio_images
          where vendor_id = vp.id
        )
      )
    returning vp.id
  )
  select array_agg(id) into v_ids from eligible;

  if v_ids is null or array_length(v_ids, 1) = 0 then
    return;
  end if;

  return query
  select
    vp.id,
    vp.user_id,
    vp.business_name,
    u.email,
    -- Count of missing pieces, useful for the email copy.
    (
      (case when coalesce(trim(vp.bio), '') = '' then 1 else 0 end) +
      (case when coalesce(trim(vp.portfolio_summary), '') = '' then 1 else 0 end) +
      (case when vp.location is null then 1 else 0 end) +
      (case when not exists (
        select 1 from public.vendor_packages
        where vendor_id = vp.id and is_active = true
      ) then 1 else 0 end) +
      (case when not exists (
        select 1 from public.vendor_portfolio_images
        where vendor_id = vp.id
      ) then 1 else 0 end)
    )::int
  from public.vendor_profiles vp
  left join auth.users u on u.id = vp.user_id
  where vp.id = any(v_ids);
end$$;

grant execute on function public.enqueue_vendor_onboarding_nudges(int, int)
  to service_role;
