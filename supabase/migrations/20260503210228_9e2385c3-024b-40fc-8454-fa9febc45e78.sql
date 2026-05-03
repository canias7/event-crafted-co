-- Event registry
create table public.event_registry_links (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null, label text not null, url text not null, description text,
  display_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index event_registry_links_host_idx on public.event_registry_links (host_id, display_order, created_at);
alter table public.event_registry_links enable row level security;
create policy "event_registry_links collaborator select" on public.event_registry_links for select to authenticated using (public.is_planning_collaborator(host_id));
create policy "event_registry_links editor insert" on public.event_registry_links for insert to authenticated with check (public.is_planning_editor(host_id));
create policy "event_registry_links editor update" on public.event_registry_links for update to authenticated using (public.is_planning_editor(host_id));
create policy "event_registry_links editor delete" on public.event_registry_links for delete to authenticated using (public.is_planning_editor(host_id));
create trigger event_registry_links_updated before update on public.event_registry_links for each row execute function public.tg_set_updated_at();

-- Geocoding + intro video
alter table public.vendor_profiles
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocoded_location text,
  add column if not exists intro_video_url text,
  add column if not exists onboarding_nudge_sent_at timestamptz,
  add column if not exists weekly_digest_enabled boolean not null default true,
  add column if not exists weekly_digest_sent_at timestamptz,
  add column if not exists slug text unique;
create index if not exists vendor_profiles_geocoded_idx on public.vendor_profiles (latitude, longitude) where latitude is not null and longitude is not null;

-- Contract templates
create table public.vendor_contract_templates (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  name text not null, body text not null, is_default boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index vendor_contract_templates_vendor_idx on public.vendor_contract_templates (vendor_id, name);
create unique index vendor_contract_templates_one_default on public.vendor_contract_templates (vendor_id) where is_default = true;
alter table public.vendor_contract_templates enable row level security;
create policy "vct member select" on public.vendor_contract_templates for select to authenticated using (public.is_vendor_member(vendor_id));
create policy "vct member insert" on public.vendor_contract_templates for insert to authenticated with check (public.is_vendor_member(vendor_id));
create policy "vct member update" on public.vendor_contract_templates for update to authenticated using (public.is_vendor_member(vendor_id));
create policy "vct member delete" on public.vendor_contract_templates for delete to authenticated using (public.is_vendor_member(vendor_id));
create trigger vct_updated before update on public.vendor_contract_templates for each row execute function public.tg_set_updated_at();

alter table public.proposals
  add column if not exists contract_body text,
  add column if not exists contract_template_id uuid references public.vendor_contract_templates(id) on delete set null,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_name text,
  add column if not exists signed_user_agent text;

-- Inquiry decay column
alter table public.inquiries
  add column if not exists review_prompt_sent_at timestamptz,
  add column if not exists intake_answers jsonb;

-- Vendor recommendations
create table public.vendor_recommendations (
  id uuid primary key default gen_random_uuid(),
  recommender_id uuid not null references public.vendor_profiles(id) on delete cascade,
  recommended_id uuid not null references public.vendor_profiles(id) on delete cascade,
  note text, display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (recommender_id, recommended_id),
  check (recommender_id <> recommended_id)
);
create index vendor_recs_recommender_idx on public.vendor_recommendations (recommender_id, display_order, created_at);
create index vendor_recs_recommended_idx on public.vendor_recommendations (recommended_id);
alter table public.vendor_recommendations enable row level security;
create policy "vendor_recommendations public read" on public.vendor_recommendations for select using (true);
create policy "vendor_recommendations member insert" on public.vendor_recommendations for insert to authenticated with check (public.is_vendor_member(recommender_id));
create policy "vendor_recommendations member update" on public.vendor_recommendations for update to authenticated using (public.is_vendor_member(recommender_id));
create policy "vendor_recommendations member delete" on public.vendor_recommendations for delete to authenticated using (public.is_vendor_member(recommender_id));

-- Calendar feed token
alter table public.profiles add column if not exists calendar_feed_token text unique;
update public.profiles set calendar_feed_token = replace(gen_random_uuid()::text, '-', '') where calendar_feed_token is null;
create or replace function public.tg_set_calendar_feed_token() returns trigger language plpgsql as $$
begin if new.calendar_feed_token is null then new.calendar_feed_token := replace(gen_random_uuid()::text, '-', ''); end if; return new; end$$;
drop trigger if exists profiles_calendar_feed_token on public.profiles;
create trigger profiles_calendar_feed_token before insert on public.profiles for each row execute function public.tg_set_calendar_feed_token();

-- Vendor slug
create or replace function public.slugify_vendor_name(p_name text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'), '-+', '-', 'g'))
$$;
do $$ declare r record; v_base text; v_candidate text; v_n int;
begin
  for r in select id, business_name from public.vendor_profiles where slug is null loop
    v_base := public.slugify_vendor_name(r.business_name);
    if v_base = '' then v_base := 'vendor'; end if;
    v_candidate := v_base; v_n := 1;
    while exists (select 1 from public.vendor_profiles where slug = v_candidate and id <> r.id) loop
      v_n := v_n + 1;
      if v_n > 5 then v_candidate := v_base || '-' || substring(r.id::text, 1, 6); exit; end if;
      v_candidate := v_base || '-' || v_n::text;
    end loop;
    update public.vendor_profiles set slug = v_candidate where id = r.id;
  end loop;
end $$;
create or replace function public.tg_set_vendor_slug() returns trigger language plpgsql as $$
declare v_base text; v_candidate text; v_n int;
begin
  if new.slug is not null and new.slug <> '' then return new; end if;
  v_base := public.slugify_vendor_name(new.business_name);
  if v_base = '' then v_base := 'vendor'; end if;
  v_candidate := v_base; v_n := 1;
  while exists (select 1 from public.vendor_profiles where slug = v_candidate) loop
    v_n := v_n + 1;
    if v_n > 5 then v_candidate := v_base || '-' || substring(new.id::text, 1, 6); exit; end if;
    v_candidate := v_base || '-' || v_n::text;
  end loop;
  new.slug := v_candidate; return new;
end$$;
drop trigger if exists vendor_profiles_set_slug on public.vendor_profiles;
create trigger vendor_profiles_set_slug before insert on public.vendor_profiles for each row execute function public.tg_set_vendor_slug();

-- Review photos
alter table public.reviews add column if not exists photo_urls jsonb not null default '[]'::jsonb;
insert into storage.buckets (id, name, public) values ('review-photos', 'review-photos', true) on conflict (id) do nothing;
create policy "review photos public read" on storage.objects for select using (bucket_id = 'review-photos');
create policy "review photos owner insert" on storage.objects for insert to authenticated with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "review photos owner delete" on storage.objects for delete to authenticated using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Intake form
create table public.vendor_intake_forms (
  vendor_id uuid primary key references public.vendor_profiles(id) on delete cascade,
  intro text, questions jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.vendor_intake_forms enable row level security;
create policy "vif public read published" on public.vendor_intake_forms for select using (is_published = true);
create policy "vif member read all" on public.vendor_intake_forms for select to authenticated using (public.is_vendor_member(vendor_id));
create policy "vif member upsert" on public.vendor_intake_forms for insert to authenticated with check (public.is_vendor_member(vendor_id));
create policy "vif member update" on public.vendor_intake_forms for update to authenticated using (public.is_vendor_member(vendor_id));
create policy "vif member delete" on public.vendor_intake_forms for delete to authenticated using (public.is_vendor_member(vendor_id));
create trigger vif_updated before update on public.vendor_intake_forms for each row execute function public.tg_set_updated_at();

-- Vendor referrals
create table public.vendor_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.vendor_profiles(id) on delete cascade,
  email text not null,
  referral_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  referred_id uuid references public.vendor_profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','signed_up','first_booking','rewarded','expired')),
  reward_percent_off numeric(5,2) not null default 1.0,
  signed_up_at timestamptz, first_booking_at timestamptz, rewarded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '90 days'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index vr_referrer_idx on public.vendor_referrals (referrer_id, status);
create index vr_email_idx on public.vendor_referrals (lower(email));
create index vr_code_idx on public.vendor_referrals (referral_code);
alter table public.vendor_referrals enable row level security;
create policy "vr member select" on public.vendor_referrals for select to authenticated
  using (public.is_vendor_member(referrer_id) or (referred_id is not null and public.is_vendor_member(referred_id)));
create policy "vr member insert" on public.vendor_referrals for insert to authenticated with check (public.is_vendor_member(referrer_id));
create policy "vr member delete pending" on public.vendor_referrals for delete to authenticated using (public.is_vendor_member(referrer_id) and status = 'pending');
create trigger vr_updated before update on public.vendor_referrals for each row execute function public.tg_set_updated_at();

-- Mood board comments
create table public.mood_board_comments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.mood_boards(id) on delete cascade,
  item_id uuid references public.mood_board_items(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index mbc_board_idx on public.mood_board_comments (board_id, created_at desc);
create index mbc_item_idx on public.mood_board_comments (item_id) where item_id is not null;
alter table public.mood_board_comments enable row level security;
create policy "mbc public read" on public.mood_board_comments for select using (true);
create policy "mbc author insert" on public.mood_board_comments for insert to authenticated with check (author_id = auth.uid());
create policy "mbc author update" on public.mood_board_comments for update to authenticated using (author_id = auth.uid());
create policy "mbc author delete" on public.mood_board_comments for delete to authenticated using (author_id = auth.uid());
create policy "mbc owner delete" on public.mood_board_comments for delete to authenticated
  using (exists (select 1 from public.mood_boards b where b.id = mood_board_comments.board_id and b.host_id = auth.uid()));

-- Direct threads + messages
create table public.direct_threads (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  inquiry_id uuid references public.inquiries(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (host_id, vendor_id)
);
create index dt_host_idx on public.direct_threads (host_id, last_message_at desc);
create index dt_vendor_idx on public.direct_threads (vendor_id, last_message_at desc);
alter table public.direct_threads enable row level security;
create policy "dt participants select" on public.direct_threads for select to authenticated using (auth.uid() = host_id or public.is_vendor_member(vendor_id));
create policy "dt host insert" on public.direct_threads for insert to authenticated with check (auth.uid() = host_id);
create policy "dt update participants" on public.direct_threads for update to authenticated using (auth.uid() = host_id or public.is_vendor_member(vendor_id));

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.direct_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('host','vendor')),
  body text not null check (length(trim(body)) > 0),
  contact_info_flagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index dm_thread_idx on public.direct_messages (thread_id, created_at);
alter table public.direct_messages enable row level security;
create policy "dm participants select" on public.direct_messages for select to authenticated
  using (exists (select 1 from public.direct_threads t where t.id = thread_id and (auth.uid() = t.host_id or public.is_vendor_member(t.vendor_id))));
create policy "dm participants insert" on public.direct_messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (select 1 from public.direct_threads t where t.id = thread_id and ((sender_role = 'host' and auth.uid() = t.host_id) or (sender_role = 'vendor' and public.is_vendor_member(t.vendor_id)))));

-- VIP + blasts
alter table public.event_guests
  add column if not exists is_vip boolean not null default false,
  add column if not exists vip_role text;
create index if not exists event_guests_vip_idx on public.event_guests (host_id) where is_vip = true;

create table public.guest_message_blasts (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null, body text not null,
  sent_to_count int not null default 0,
  sent_at timestamptz not null default now(),
  audience jsonb not null default '{}'::jsonb
);
create index gmb_host_idx on public.guest_message_blasts (host_id, sent_at desc);
alter table public.guest_message_blasts enable row level security;
create policy "gmb host all" on public.guest_message_blasts for all to authenticated using (auth.uid() = host_id) with check (auth.uid() = host_id);

-- Inquiry labels
create table public.vendor_inquiry_labels (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  name text not null,
  color text not null default '#a08259',
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (vendor_id, name)
);
create index vil_vendor_idx on public.vendor_inquiry_labels (vendor_id, display_order);
alter table public.vendor_inquiry_labels enable row level security;
create policy "vil member select" on public.vendor_inquiry_labels for select to authenticated using (public.is_vendor_member(vendor_id));
create policy "vil member insert" on public.vendor_inquiry_labels for insert to authenticated with check (public.is_vendor_member(vendor_id));
create policy "vil member update" on public.vendor_inquiry_labels for update to authenticated using (public.is_vendor_member(vendor_id));
create policy "vil member delete" on public.vendor_inquiry_labels for delete to authenticated using (public.is_vendor_member(vendor_id));

create table public.inquiry_label_assignments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  label_id uuid not null references public.vendor_inquiry_labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (inquiry_id, label_id)
);
create index ila_inquiry_idx on public.inquiry_label_assignments (inquiry_id);
create index ila_label_idx on public.inquiry_label_assignments (label_id);
alter table public.inquiry_label_assignments enable row level security;

create or replace function public.is_inquiry_vendor_member(_inquiry_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.inquiries i join public.vendor_team_members m on m.vendor_id = i.vendor_id and m.user_id = auth.uid() where i.id = _inquiry_id)
$$;
grant execute on function public.is_inquiry_vendor_member(uuid) to authenticated;
create policy "ila vendor select" on public.inquiry_label_assignments for select to authenticated using (public.is_inquiry_vendor_member(inquiry_id));
create policy "ila vendor insert" on public.inquiry_label_assignments for insert to authenticated with check (public.is_inquiry_vendor_member(inquiry_id));
create policy "ila vendor delete" on public.inquiry_label_assignments for delete to authenticated using (public.is_inquiry_vendor_member(inquiry_id));

-- Group gifts
create table public.gift_wishes (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, description text,
  target_cents integer, image_url text, source_url text,
  share_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index gw_host_idx on public.gift_wishes (host_id, created_at desc);
create index gw_token_idx on public.gift_wishes (share_token);
alter table public.gift_wishes enable row level security;
create policy "gw public read" on public.gift_wishes for select using (true);
create policy "gw host insert" on public.gift_wishes for insert to authenticated with check (auth.uid() = host_id);
create policy "gw host update" on public.gift_wishes for update to authenticated using (auth.uid() = host_id);
create policy "gw host delete" on public.gift_wishes for delete to authenticated using (auth.uid() = host_id);
create trigger gw_updated before update on public.gift_wishes for each row execute function public.tg_set_updated_at();

create table public.gift_pledges (
  id uuid primary key default gen_random_uuid(),
  wish_id uuid not null references public.gift_wishes(id) on delete cascade,
  contributor_name text not null, contributor_email text,
  amount_cents integer not null check (amount_cents > 0),
  message text, created_at timestamptz not null default now()
);
create index gp_wish_idx on public.gift_pledges (wish_id, created_at desc);
alter table public.gift_pledges enable row level security;
create policy "gp host select" on public.gift_pledges for select to authenticated
  using (exists (select 1 from public.gift_wishes w where w.id = wish_id and w.host_id = auth.uid()));
create policy "gp host delete" on public.gift_pledges for delete to authenticated
  using (exists (select 1 from public.gift_wishes w where w.id = wish_id and w.host_id = auth.uid()));

-- Imported reviews
create table public.imported_reviews (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  source text not null check (source in ('knot','yelp','google','wedding_wire','facebook','other')),
  reviewer_name text not null,
  rating numeric(2,1) not null check (rating >= 1 and rating <= 5),
  body text, reviewed_at date,
  created_at timestamptz not null default now()
);
create index ir_vendor_idx on public.imported_reviews (vendor_id, reviewed_at desc, created_at desc);
alter table public.imported_reviews enable row level security;
create policy "ir public read" on public.imported_reviews for select using (true);
create policy "ir member insert" on public.imported_reviews for insert to authenticated with check (public.is_vendor_member(vendor_id));
create policy "ir member update" on public.imported_reviews for update to authenticated using (public.is_vendor_member(vendor_id));
create policy "ir member delete" on public.imported_reviews for delete to authenticated using (public.is_vendor_member(vendor_id));

-- Showcase clips
insert into storage.buckets (id, name, public) values ('vendor-showcase-clips', 'vendor-showcase-clips', true) on conflict (id) do nothing;
create policy "vsc public read" on storage.objects for select using (bucket_id = 'vendor-showcase-clips');
create policy "vsc owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'vendor-showcase-clips' and exists (select 1 from public.vendor_profiles vp where vp.id::text = (storage.foldername(name))[1] and vp.user_id = auth.uid()));
create policy "vsc owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'vendor-showcase-clips' and exists (select 1 from public.vendor_profiles vp where vp.id::text = (storage.foldername(name))[1] and vp.user_id = auth.uid()));

create table public.vendor_showcase_clips (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  video_path text not null, poster_path text, caption text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
create index vsc_vendor_idx on public.vendor_showcase_clips (vendor_id, display_order, created_at);
alter table public.vendor_showcase_clips enable row level security;
create policy "vsc public read tbl" on public.vendor_showcase_clips for select using (true);
create policy "vsc member insert" on public.vendor_showcase_clips for insert to authenticated with check (public.is_vendor_member(vendor_id));
create policy "vsc member update" on public.vendor_showcase_clips for update to authenticated using (public.is_vendor_member(vendor_id));
create policy "vsc member delete" on public.vendor_showcase_clips for delete to authenticated using (public.is_vendor_member(vendor_id));

-- Host reputation
create table public.host_reliability_flags (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  flag_type text not null check (flag_type in ('no_show','unresponsive','paid_late','pleasant','great_communication','rebooked')),
  note text, created_at timestamptz not null default now()
);
create index hrf_host_idx on public.host_reliability_flags (host_id, created_at desc);
create index hrf_vendor_idx on public.host_reliability_flags (vendor_id, created_at desc);
alter table public.host_reliability_flags enable row level security;
create policy "hrf vendor select" on public.host_reliability_flags for select to authenticated
  using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create policy "hrf vendor insert" on public.host_reliability_flags for insert to authenticated
  with check (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid())
    and exists (select 1 from public.inquiries i where i.host_id = host_reliability_flags.host_id and i.vendor_id = host_reliability_flags.vendor_id));
create policy "hrf vendor delete" on public.host_reliability_flags for delete to authenticated
  using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));