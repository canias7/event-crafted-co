-- cobooking signals
create or replace function public.get_cobooked_vendors(p_vendor_id uuid, p_limit int default 6)
returns table (vendor_id uuid, business_name text, category text, location text, cobookings int, is_curated boolean)
language sql stable security definer set search_path = public as $$
  with same_host_wins as (select distinct host_id from public.inquiries where vendor_id = p_vendor_id and status = 'won'),
  cobooks as (select i.vendor_id, count(*)::int as n from public.inquiries i join same_host_wins s on s.host_id = i.host_id
    where i.status = 'won' and i.vendor_id <> p_vendor_id group by i.vendor_id),
  curated as (select recommended_id as vendor_id from public.vendor_recommendations where recommender_id = p_vendor_id),
  combined as (select vp.id as vendor_id, vp.business_name, vp.category, vp.location, coalesce(c.n, 0) as cobookings,
    (cu.vendor_id is not null) as is_curated, coalesce(c.n, 0) + (case when cu.vendor_id is not null then 1 else 0 end) as score
    from public.vendor_profiles vp left join cobooks c on c.vendor_id = vp.id left join curated cu on cu.vendor_id = vp.id
    where vp.id <> p_vendor_id and (c.n is not null or cu.vendor_id is not null))
  select vendor_id, business_name, category, location, cobookings, is_curated from combined order by score desc, business_name asc limit p_limit;
$$;
revoke execute on function public.get_cobooked_vendors(uuid, int) from public;
grant execute on function public.get_cobooked_vendors(uuid, int) to anon, authenticated;

create or replace function public.get_recommended_for_host(p_host_id uuid, p_limit int default 6)
returns table (vendor_id uuid, business_name text, category text, location text, cobookings int)
language sql stable security definer set search_path = public as $$
  with my_wins as (select distinct vendor_id from public.inquiries where host_id = p_host_id and status = 'won'),
  peer_hosts as (select distinct i.host_id from public.inquiries i join my_wins m on m.vendor_id = i.vendor_id where i.status = 'won' and i.host_id <> p_host_id),
  peer_books as (select i.vendor_id, count(*)::int as n from public.inquiries i join peer_hosts p on p.host_id = i.host_id where i.status = 'won' group by i.vendor_id),
  exclude as (select distinct vendor_id from public.inquiries where host_id = p_host_id)
  select vp.id, vp.business_name, vp.category, vp.location, pb.n from peer_books pb
  join public.vendor_profiles vp on vp.id = pb.vendor_id where pb.vendor_id not in (select vendor_id from exclude)
  order by pb.n desc, vp.business_name asc limit p_limit;
$$;
revoke execute on function public.get_recommended_for_host(uuid, int) from public;
grant execute on function public.get_recommended_for_host(uuid, int) to authenticated;

-- vendor profile score
create or replace function public.get_vendor_profile_score(p_vendor_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_profile record; v_portfolio_count int; v_packages_count int; v_clips_count int; v_verified_count int;
  v_recs_count int; v_imported_reviews_count int; v_real_events_count int; v_intake_count int;
  c_bio boolean; c_location boolean; c_price boolean; c_portfolio boolean; c_packages boolean;
  c_intro_video boolean; c_clips boolean; c_verified boolean; c_imported boolean; c_real_event boolean;
  c_intake boolean; c_recs boolean; score int := 0;
begin
  select * into v_profile from public.vendor_profiles where id = p_vendor_id;
  if v_profile.id is null then raise exception 'vendor not found'; end if;
  select count(*) into v_portfolio_count from public.vendor_portfolio_images where vendor_id = p_vendor_id;
  select count(*) into v_packages_count from public.vendor_packages where vendor_id = p_vendor_id and is_active = true;
  select count(*) into v_clips_count from public.vendor_showcase_clips where vendor_id = p_vendor_id;
  select count(*) into v_verified_count from public.vendor_verifications where vendor_id = p_vendor_id and status = 'approved';
  select count(*) into v_recs_count from public.vendor_recommendations where recommender_id = p_vendor_id;
  select count(*) into v_imported_reviews_count from public.imported_reviews where vendor_id = p_vendor_id;
  select count(*) into v_real_events_count from public.real_events where vendor_id = p_vendor_id and published_at is not null and host_consent_given_at is not null;
  select coalesce(jsonb_array_length(questions), 0) into v_intake_count from public.vendor_intake_forms where vendor_id = p_vendor_id and is_published = true;
  v_intake_count := coalesce(v_intake_count, 0);
  c_bio := coalesce(length(trim(coalesce(v_profile.bio, ''))) >= 60, false);
  c_location := coalesce(length(trim(coalesce(v_profile.location, ''))) > 0, false);
  c_price := v_profile.base_price_cents is not null and v_profile.base_price_cents > 0;
  c_portfolio := v_portfolio_count >= 5; c_packages := v_packages_count >= 2;
  c_intro_video := coalesce(length(trim(coalesce(v_profile.intro_video_url, ''))) > 0, false);
  c_clips := v_clips_count >= 1; c_verified := v_verified_count >= 1;
  c_imported := v_imported_reviews_count >= 3; c_real_event := v_real_events_count >= 1;
  c_intake := v_intake_count >= 1; c_recs := v_recs_count >= 1;
  if c_bio then score := score + 8; end if;
  if c_location then score := score + 5; end if;
  if c_price then score := score + 5; end if;
  if c_portfolio then score := score + 12; end if;
  if c_packages then score := score + 12; end if;
  if c_intro_video then score := score + 8; end if;
  if c_clips then score := score + 8; end if;
  if c_verified then score := score + 12; end if;
  if c_imported then score := score + 8; end if;
  if c_real_event then score := score + 12; end if;
  if c_intake then score := score + 5; end if;
  if c_recs then score := score + 5; end if;
  return jsonb_build_object('score', score, 'checks', jsonb_build_array(
    jsonb_build_object('label','Bio + tagline written','weight',8,'done',c_bio,'hint','60+ characters of who you are and what you do'),
    jsonb_build_object('label','Location set','weight',5,'done',c_location,'hint',null),
    jsonb_build_object('label','Starting price set','weight',5,'done',c_price,'hint',null),
    jsonb_build_object('label','5+ portfolio photos','weight',12,'done',c_portfolio,'hint','Hosts skim portfolios first'),
    jsonb_build_object('label','2+ active packages','weight',12,'done',c_packages,'hint','Vendors with priced tiers convert faster'),
    jsonb_build_object('label','Intro video','weight',8,'done',c_intro_video,'hint','A 60-90s video lifts inquiry quality'),
    jsonb_build_object('label','At least one showcase clip','weight',8,'done',c_clips,'hint',null),
    jsonb_build_object('label','Trust verification (any)','weight',12,'done',c_verified,'hint','ID / insurance / business license badge'),
    jsonb_build_object('label','3+ imported reviews','weight',8,'done',c_imported,'hint','Paste in existing reviews'),
    jsonb_build_object('label','1+ published real-event gallery','weight',12,'done',c_real_event,'hint',null),
    jsonb_build_object('label','Custom intake form','weight',5,'done',c_intake,'hint','Ask qualifying questions'),
    jsonb_build_object('label','1+ partner recommendation','weight',5,'done',c_recs,'hint',null)));
end$$;
revoke execute on function public.get_vendor_profile_score(uuid) from public;
grant execute on function public.get_vendor_profile_score(uuid) to authenticated;

-- background check verification kind
alter table public.vendor_verifications drop constraint if exists vendor_verifications_kind_check;
alter table public.vendor_verifications add constraint vendor_verifications_kind_check
  check (kind in ('identity', 'insurance', 'business_license', 'background_check'));

-- onboarding tour
alter table public.profiles add column if not exists tour_dismissed_at timestamptz;

-- staffing
alter table public.vendor_profiles
  add column if not exists is_staffing boolean not null default false,
  add column if not exists hourly_rate_cents int,
  add column if not exists min_hours int;
create index if not exists vendor_profiles_staffing_idx on public.vendor_profiles (category, hourly_rate_cents) where is_staffing = true;

-- appointment external link
alter table public.appointments
  add column if not exists external_event_id text,
  add column if not exists external_event_provider text check (external_event_provider in ('google') or external_event_provider is null),
  add column if not exists external_synced_at timestamptz;

-- appointment video links
alter table public.appointments
  add column if not exists meeting_url text,
  add column if not exists meeting_provider text check (meeting_provider in ('jitsi', 'google_meet') or meeting_provider is null);

create or replace function public.set_default_meeting_url()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.meeting_url is null and new.kind in ('consultation','phone_call','other') then
    new.meeting_url := 'https://meet.jit.si/vendora-' || replace(new.id::text, '-', '');
    new.meeting_provider := 'jitsi';
  end if;
  return new;
end$$;
drop trigger if exists appointments_default_meeting_url on public.appointments;
create trigger appointments_default_meeting_url before insert on public.appointments
  for each row execute function public.set_default_meeting_url();

update public.appointments set meeting_url = 'https://meet.jit.si/vendora-' || replace(id::text, '-', ''),
  meeting_provider = 'jitsi' where meeting_url is null and kind in ('consultation','phone_call','other');

-- reengagement
create table public.vendor_reengagement_log (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null,
  host_id uuid not null,
  inquiry_id uuid not null,
  occasion text not null,
  event_type text,
  upcoming_date date not null,
  notified_at timestamptz not null default now(),
  unique (vendor_id, host_id, inquiry_id, occasion)
);
create index vendor_reengagement_log_vendor_idx on public.vendor_reengagement_log (vendor_id, notified_at desc);
alter table public.vendor_reengagement_log enable row level security;
create policy "vendor_reengagement_log vendor read" on public.vendor_reengagement_log for select to authenticated
  using (public.is_vendor_member(vendor_id));
alter table public.profiles add column if not exists reengagement_emails_enabled boolean not null default true;

-- saved search email alerts
alter table public.saved_searches add column if not exists email_alerts_enabled boolean not null default false;