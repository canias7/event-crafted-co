-- Drop the imported-reviews feature. Decided we don't want vendors
-- pasting in third-party reviews — only Vendora-native reviews count
-- toward the trust signal. Table has 0 rows (verified pre-drop) so
-- no data loss.
--
-- Also rewrites get_vendor_profile_score to drop the c_imported
-- check and redistribute its 8 points across the highest-signal
-- completeness items (portfolio +3, real_event +3, verified +2),
-- preserving the 0-100 sum so the dashboard widget stays correct.

-- Rewrite the profile-score function FIRST (still references the
-- table). New version drops c_imported entirely.
create or replace function public.get_vendor_profile_score(
  p_vendor_id uuid
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_profile record;
  v_portfolio_count int;
  v_packages_count int;
  v_clips_count int;
  v_verified_count int;
  v_recs_count int;
  v_real_events_count int;
  v_intake_count int;

  c_bio boolean;
  c_location boolean;
  c_price boolean;
  c_portfolio boolean;
  c_packages boolean;
  c_intro_video boolean;
  c_clips boolean;
  c_verified boolean;
  c_real_event boolean;
  c_intake boolean;
  c_recs boolean;

  score int := 0;
begin
  select * into v_profile from public.vendor_profiles where id = p_vendor_id;
  if v_profile.id is null then
    raise exception 'vendor not found';
  end if;

  select count(*) into v_portfolio_count
    from public.vendor_portfolio_images where vendor_id = p_vendor_id;
  select count(*) into v_packages_count
    from public.vendor_packages where vendor_id = p_vendor_id and is_active = true;
  select count(*) into v_clips_count
    from public.vendor_showcase_clips where vendor_id = p_vendor_id;
  select count(*) into v_verified_count
    from public.vendor_verifications
    where vendor_id = p_vendor_id and status = 'approved';
  select count(*) into v_recs_count
    from public.vendor_recommendations where recommender_id = p_vendor_id;
  select count(*) into v_real_events_count
    from public.real_events
    where vendor_id = p_vendor_id
      and published_at is not null and host_consent_given_at is not null;
  select coalesce(jsonb_array_length(questions), 0) into v_intake_count
    from public.vendor_intake_forms
    where vendor_id = p_vendor_id and is_published = true;
  v_intake_count := coalesce(v_intake_count, 0);

  c_bio          := coalesce(length(trim(coalesce(v_profile.bio, ''))) >= 60, false);
  c_location     := coalesce(length(trim(coalesce(v_profile.location, ''))) > 0, false);
  c_price        := v_profile.base_price_cents is not null and v_profile.base_price_cents > 0;
  c_portfolio    := v_portfolio_count >= 5;
  c_packages     := v_packages_count >= 2;
  c_intro_video  := coalesce(length(trim(coalesce(v_profile.intro_video_url, ''))) > 0, false);
  c_clips        := v_clips_count >= 1;
  c_verified     := v_verified_count >= 1;
  c_real_event   := v_real_events_count >= 1;
  c_intake       := v_intake_count >= 1;
  c_recs         := v_recs_count >= 1;

  -- Weights sum to 100. The 8 points previously held by "imported
  -- reviews" are redistributed: portfolio +3, real_event +3,
  -- verified +2 — the three highest-signal items.
  if c_bio          then score := score + 8;  end if;
  if c_location     then score := score + 5;  end if;
  if c_price        then score := score + 5;  end if;
  if c_portfolio    then score := score + 15; end if;
  if c_packages     then score := score + 12; end if;
  if c_intro_video  then score := score + 8;  end if;
  if c_clips        then score := score + 8;  end if;
  if c_verified     then score := score + 14; end if;
  if c_real_event   then score := score + 15; end if;
  if c_intake       then score := score + 5;  end if;
  if c_recs         then score := score + 5;  end if;

  return jsonb_build_object(
    'score', score,
    'checks', jsonb_build_array(
      jsonb_build_object('label', 'Bio + tagline written',           'weight', 8,  'done', c_bio,         'hint', '60+ characters of who you are and what you do'),
      jsonb_build_object('label', 'Location set',                    'weight', 5,  'done', c_location,    'hint', null),
      jsonb_build_object('label', 'Starting price set',              'weight', 5,  'done', c_price,       'hint', null),
      jsonb_build_object('label', '5+ portfolio photos',             'weight', 15, 'done', c_portfolio,   'hint', 'Hosts skim portfolios first — show your range'),
      jsonb_build_object('label', '2+ active packages',              'weight', 12, 'done', c_packages,    'hint', 'Vendors with priced tiers convert ~2x faster'),
      jsonb_build_object('label', 'Intro video',                     'weight', 8,  'done', c_intro_video, 'hint', 'A 60-90s video lifts inquiry quality measurably'),
      jsonb_build_object('label', 'At least one showcase clip',      'weight', 8,  'done', c_clips,       'hint', 'Short vertical clips render in the detail-page reel'),
      jsonb_build_object('label', 'Trust verification (any)',        'weight', 14, 'done', c_verified,    'hint', 'ID / insurance / business license badge'),
      jsonb_build_object('label', '1+ published real-event gallery', 'weight', 15, 'done', c_real_event,  'hint', 'One real-event story beats 10 portfolio shots'),
      jsonb_build_object('label', 'Custom intake form',              'weight', 5,  'done', c_intake,      'hint', 'Ask qualifying questions before you quote'),
      jsonb_build_object('label', 'Partner recommendations',         'weight', 5,  'done', c_recs,        'hint', 'Refer 1-2 partners — earns you cross-listings too')
    )
  );
end$$;

revoke execute on function public.get_vendor_profile_score(uuid) from public, anon;
grant execute on function public.get_vendor_profile_score(uuid) to authenticated;

-- Now safe to drop the table — nothing references it anymore.
drop table if exists public.imported_reviews;
