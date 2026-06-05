-- Fix a pre-existing ambiguity in enqueue_vendor_onboarding_nudges: the
-- RETURNS TABLE OUT column `vendor_id` collided with
-- vendor_portfolio_images.vendor_id in the not-exists checks, so the
-- function errored on every call. Alias the table to disambiguate.
create or replace function public.enqueue_vendor_onboarding_nudges(p_min_age_days integer default 3, p_cooldown_days integer default 7)
returns table(vendor_id uuid, user_id uuid, business_name text, email text, missing_count integer)
language plpgsql security definer set search_path to 'public' as $function$
declare v_ids uuid[];
begin
  with eligible as (
    update public.vendor_profiles vp set onboarding_nudge_sent_at = now()
    where vp.created_at < (now() - make_interval(days => p_min_age_days))
      and (vp.onboarding_nudge_sent_at is null or vp.onboarding_nudge_sent_at < (now() - make_interval(days => p_cooldown_days)))
      and (coalesce(trim(vp.bio), '') = '' or coalesce(trim(vp.portfolio_summary), '') = '' or vp.location is null
        or not exists (select 1 from public.vendor_portfolio_images vpi where vpi.vendor_id = vp.id))
    returning vp.id
  ) select array_agg(id) into v_ids from eligible;
  if v_ids is null or array_length(v_ids, 1) = 0 then return; end if;
  return query
  select vp.id, vp.user_id, vp.business_name, u.email,
    ((case when coalesce(trim(vp.bio), '') = '' then 1 else 0 end) +
     (case when coalesce(trim(vp.portfolio_summary), '') = '' then 1 else 0 end) +
     (case when vp.location is null then 1 else 0 end) +
     (case when not exists (select 1 from public.vendor_portfolio_images vpi where vpi.vendor_id = vp.id) then 1 else 0 end))::int
  from public.vendor_profiles vp left join auth.users u on u.id = vp.user_id where vp.id = any(v_ids);
end$function$;
