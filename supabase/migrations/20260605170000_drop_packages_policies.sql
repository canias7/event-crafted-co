-- Fully remove the packages + policies features at the DB level.
--
-- Three live functions referenced vendor_packages, so they're recreated
-- without it first, then the view / FK / column / table / policy columns
-- are dropped. Edge functions that read these (hilux-prompt loadVendorContext,
-- my-space-chat) were updated in the same change.
--
--   • get_budget_benchmarks   — repointed from package prices to
--                               vendor_profiles.base_price_cents
--   • get_vendor_profile_score — dropped the "2+ active packages" check;
--                               its 12 points redistributed (portfolio +5,
--                               real-event +5, bio +2) so max stays 100
--   • enqueue_vendor_onboarding_nudges — dropped the "no packages" nudge

-- 1. Budget benchmarks now aggregate base price instead of package prices.
create or replace function public.get_budget_benchmarks(p_category text, p_location text default null::text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  result jsonb;
  sample_count integer;
begin
  with category_aliases as (
    select unnest(case lower(p_category)
      when 'photography' then array['photographer','photography']
      when 'videography' then array['videographer','videography']
      when 'florals' then array['florist','florals','floral designer']
      when 'catering' then array['catering','caterer']
      when 'music & entertainment' then array['dj','musician','band','music & entertainment','entertainment']
      when 'cake & bakery' then array['baker','bakery','cake & bakery','pastry']
      when 'decorations' then array['decorator','decor','event designer','decorations']
      when 'beauty' then array['makeup artist','hair stylist','beauty']
      when 'venue' then array['venue']
      when 'invitations' then array['stationer','calligrapher','invitations']
      when 'transportation' then array['transportation','car service','limo']
      when 'av / equipment' then array['av','equipment rental','av / equipment']
      else array[lower(p_category)]
    end) as alias
  ),
  matched_prices as (
    select vp.base_price_cents as price_cents
    from public.vendor_profiles vp
    where vp.base_price_cents is not null
      and vp.base_price_cents > 0
      and lower(vp.category) in (select alias from category_aliases)
      and (p_location is null or p_location = '' or vp.location ilike '%' || p_location || '%')
  )
  select count(*),
    jsonb_build_object(
      'category', p_category, 'location', p_location, 'sample_size', count(*),
      'p25_cents', percentile_cont(0.25) within group (order by price_cents)::int,
      'p50_cents', percentile_cont(0.50) within group (order by price_cents)::int,
      'p75_cents', percentile_cont(0.75) within group (order by price_cents)::int,
      'p90_cents', percentile_cont(0.90) within group (order by price_cents)::int,
      'min_cents', min(price_cents), 'max_cents', max(price_cents)
    )
  into sample_count, result
  from matched_prices;

  if sample_count is null or sample_count < 5 then return null; end if;
  return result;
end$function$;

-- 2. Profile score without the packages check (weights redistributed).
create or replace function public.get_vendor_profile_score(p_vendor_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_profile record;
  v_portfolio_count int;
  v_clips_count int;
  v_verified_count int;
  v_recs_count int;
  v_real_events_count int;
  v_intake_count int;
  c_bio boolean; c_location boolean; c_price boolean; c_portfolio boolean;
  c_intro_video boolean; c_clips boolean; c_verified boolean; c_real_event boolean;
  c_intake boolean; c_recs boolean;
  score int := 0;
begin
  select * into v_profile from public.vendor_profiles where id = p_vendor_id;
  if v_profile.id is null then raise exception 'vendor not found'; end if;
  select count(*) into v_portfolio_count from public.vendor_portfolio_images where vendor_id = p_vendor_id;
  select count(*) into v_clips_count from public.vendor_showcase_clips where vendor_id = p_vendor_id;
  select count(*) into v_verified_count from public.vendor_verifications where vendor_id = p_vendor_id and status = 'approved';
  select count(*) into v_recs_count from public.vendor_recommendations where recommender_id = p_vendor_id;
  select count(*) into v_real_events_count from public.real_events where vendor_id = p_vendor_id and published_at is not null and host_consent_given_at is not null;
  select coalesce(jsonb_array_length(questions), 0) into v_intake_count from public.vendor_intake_forms where vendor_id = p_vendor_id and is_published = true;
  v_intake_count := coalesce(v_intake_count, 0);
  c_bio          := coalesce(length(trim(coalesce(v_profile.bio, ''))) >= 60, false);
  c_location     := coalesce(length(trim(coalesce(v_profile.location, ''))) > 0, false);
  c_price        := v_profile.base_price_cents is not null and v_profile.base_price_cents > 0;
  c_portfolio    := v_portfolio_count >= 5;
  c_intro_video  := coalesce(length(trim(coalesce(v_profile.intro_video_url, ''))) > 0, false);
  c_clips        := v_clips_count >= 1;
  c_verified     := v_verified_count >= 1;
  c_real_event   := v_real_events_count >= 1;
  c_intake       := v_intake_count >= 1;
  c_recs         := v_recs_count >= 1;
  if c_bio          then score := score + 10; end if;
  if c_location     then score := score + 5;  end if;
  if c_price        then score := score + 5;  end if;
  if c_portfolio    then score := score + 20; end if;
  if c_intro_video  then score := score + 8;  end if;
  if c_clips        then score := score + 8;  end if;
  if c_verified     then score := score + 14; end if;
  if c_real_event   then score := score + 20; end if;
  if c_intake       then score := score + 5;  end if;
  if c_recs         then score := score + 5;  end if;
  return jsonb_build_object(
    'score', score,
    'checks', jsonb_build_array(
      jsonb_build_object('label','Bio + tagline written','weight',10,'done',c_bio,'hint','60+ characters of who you are and what you do'),
      jsonb_build_object('label','Location set','weight',5,'done',c_location,'hint',null),
      jsonb_build_object('label','Starting price set','weight',5,'done',c_price,'hint',null),
      jsonb_build_object('label','5+ portfolio photos','weight',20,'done',c_portfolio,'hint','Hosts skim portfolios first — show your range'),
      jsonb_build_object('label','Intro video','weight',8,'done',c_intro_video,'hint','A 60-90s video lifts inquiry quality measurably'),
      jsonb_build_object('label','At least one showcase clip','weight',8,'done',c_clips,'hint','Short vertical clips render in the detail-page reel'),
      jsonb_build_object('label','Trust verification (any)','weight',14,'done',c_verified,'hint','ID / insurance / business license badge'),
      jsonb_build_object('label','1+ published real-event gallery','weight',20,'done',c_real_event,'hint','One real-event story beats 10 portfolio shots'),
      jsonb_build_object('label','Custom intake form','weight',5,'done',c_intake,'hint','Ask qualifying questions before you quote'),
      jsonb_build_object('label','Partner recommendations','weight',5,'done',c_recs,'hint','Refer 1-2 partners — earns you cross-listings too')
    )
  );
end$function$;

-- 3. Onboarding nudges without the "no packages" factor.
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
        or not exists (select 1 from public.vendor_portfolio_images where vendor_id = vp.id))
    returning vp.id
  ) select array_agg(id) into v_ids from eligible;
  if v_ids is null or array_length(v_ids, 1) = 0 then return; end if;
  return query
  select vp.id, vp.user_id, vp.business_name, u.email,
    ((case when coalesce(trim(vp.bio), '') = '' then 1 else 0 end) +
     (case when coalesce(trim(vp.portfolio_summary), '') = '' then 1 else 0 end) +
     (case when vp.location is null then 1 else 0 end) +
     (case when not exists (select 1 from public.vendor_portfolio_images where vendor_id = vp.id) then 1 else 0 end))::int
  from public.vendor_profiles vp left join auth.users u on u.id = vp.user_id where vp.id = any(v_ids);
end$function$;

-- 4. Drop the package + policy schema.
drop view if exists public.package_rating_summary;
alter table public.inquiries drop column if exists package_id;
drop table if exists public.vendor_packages cascade;
alter table public.vendor_profiles
  drop column if exists deposit_pct,
  drop column if exists cancellation_policy,
  drop column if exists reschedule_window_days,
  drop column if exists policy_notes;
