
-- =========================================================================
-- 01: tighten_public_read_policies (best-effort hardening; idempotent)
-- =========================================================================
do $$ begin
  -- Restrict public select on vendor_verifications to only owner/admin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='vendor_verifications' and policyname='Public can view verifications') then
    drop policy "Public can view verifications" on public.vendor_verifications;
  end if;
exception when others then null; end $$;

-- =========================================================================
-- 02: inquiries_rate_limit
-- =========================================================================
create or replace function public.tg_inquiries_rate_limit()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_count int;
begin
  select count(*) into v_count from public.inquiries
    where host_id = new.host_id and created_at > now() - interval '1 hour';
  if v_count >= 20 then
    raise exception 'Rate limit: too many inquiries created in the last hour';
  end if;
  return new;
end$$;
drop trigger if exists trg_inquiries_rate_limit on public.inquiries;
create trigger trg_inquiries_rate_limit before insert on public.inquiries
  for each row execute function public.tg_inquiries_rate_limit();

-- =========================================================================
-- 03: budget_benchmarks_rpc
-- =========================================================================
create or replace function public.get_budget_benchmarks(p_category text, p_location text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_p25 numeric; v_p50 numeric; v_p75 numeric; v_n int;
begin
  select percentile_cont(0.25) within group (order by base_price_cents),
         percentile_cont(0.50) within group (order by base_price_cents),
         percentile_cont(0.75) within group (order by base_price_cents),
         count(*)
  into v_p25, v_p50, v_p75, v_n
  from public.vendor_profiles
  where category = p_category and base_price_cents is not null and base_price_cents > 0
    and (p_location is null or location ilike '%'||p_location||'%');
  return jsonb_build_object('p25',v_p25,'p50',v_p50,'p75',v_p75,'sample_size',v_n);
end$$;

-- =========================================================================
-- 04: real_events_host_published
-- =========================================================================
alter table public.real_events
  add column if not exists host_id uuid,
  add column if not exists published_at timestamptz,
  add column if not exists host_consent_given_at timestamptz;

-- =========================================================================
-- 05: vendor_availability_recurring
-- =========================================================================
create table if not exists public.vendor_availability_recurring (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.vendor_availability_recurring enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='vendor_availability_recurring' and policyname='Public read recurring availability') then
    create policy "Public read recurring availability" on public.vendor_availability_recurring for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='vendor_availability_recurring' and policyname='Vendor team manages recurring availability') then
    create policy "Vendor team manages recurring availability" on public.vendor_availability_recurring
      for all using (public.is_vendor_member(vendor_id)) with check (public.is_vendor_member(vendor_id));
  end if;
end $$;

create or replace function public.get_vendor_availability(p_vendor_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_recurring jsonb; v_busy jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('weekday',weekday,'start_time',start_time,'end_time',end_time,'is_available',is_available)), '[]'::jsonb)
    into v_recurring from public.vendor_availability_recurring where vendor_id = p_vendor_id;
  v_busy := '[]'::jsonb;
  return jsonb_build_object('recurring', v_recurring, 'busy', v_busy);
end$$;

-- =========================================================================
-- 06: editorial_articles + storage bucket
-- =========================================================================
create table if not exists public.editorial_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  cover_image_url text,
  body_md text,
  author_name text,
  category text,
  tags text[] default '{}',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.editorial_articles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='editorial_articles' and policyname='Public reads published articles') then
    create policy "Public reads published articles" on public.editorial_articles for select using (published_at is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename='editorial_articles' and policyname='Admins manage articles') then
    create policy "Admins manage articles" on public.editorial_articles for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;
drop trigger if exists trg_editorial_articles_updated on public.editorial_articles;
create trigger trg_editorial_articles_updated before update on public.editorial_articles
  for each row execute function public.tg_set_updated_at();

insert into storage.buckets (id, name, public)
  values ('editorial-images','editorial-images', true) on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Editorial images public read') then
    create policy "Editorial images public read" on storage.objects for select using (bucket_id='editorial-images');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Editorial images admin write') then
    create policy "Editorial images admin write" on storage.objects for insert with check (bucket_id='editorial-images' and public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Editorial images admin update') then
    create policy "Editorial images admin update" on storage.objects for update using (bucket_id='editorial-images' and public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Editorial images admin delete') then
    create policy "Editorial images admin delete" on storage.objects for delete using (bucket_id='editorial-images' and public.is_admin());
  end if;
end $$;

-- =========================================================================
-- 07: vendor_claim_listings
-- =========================================================================
create table if not exists public.vendor_claim_listings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  invite_token text not null unique default replace(gen_random_uuid()::text,'-',''),
  invite_email text,
  claimed_at timestamptz,
  claimed_by uuid,
  created_at timestamptz not null default now()
);
alter table public.vendor_claim_listings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='vendor_claim_listings' and policyname='Admins manage claim invites') then
    create policy "Admins manage claim invites" on public.vendor_claim_listings for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

create or replace function public.get_claim_invitation_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_inv public.vendor_claim_listings; v_business text;
begin
  select * into v_inv from public.vendor_claim_listings where invite_token = p_token;
  if v_inv.id is null then return null; end if;
  select business_name into v_business from public.vendor_profiles where id = v_inv.vendor_id;
  return jsonb_build_object('vendor_id',v_inv.vendor_id,'business_name',v_business,'invite_email',v_inv.invite_email,'claimed_at',v_inv.claimed_at);
end$$;

create or replace function public.claim_vendor_listing(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_inv public.vendor_claim_listings; v_user uuid := auth.uid();
begin
  if v_user is null then return jsonb_build_object('ok',false,'error','not_authenticated'); end if;
  select * into v_inv from public.vendor_claim_listings where invite_token = p_token;
  if v_inv.id is null then return jsonb_build_object('ok',false,'error','invite_not_found'); end if;
  if v_inv.claimed_at is not null then return jsonb_build_object('ok',false,'error','already_claimed'); end if;
  update public.vendor_profiles set user_id = v_user where id = v_inv.vendor_id and user_id is null;
  insert into public.vendor_team_members (vendor_id, user_id, role)
    values (v_inv.vendor_id, v_user, 'owner') on conflict do nothing;
  update public.vendor_claim_listings set claimed_at = now(), claimed_by = v_user where id = v_inv.id;
  return jsonb_build_object('ok',true,'vendor_id',v_inv.vendor_id);
end$$;

-- =========================================================================
-- 08: vendor_profile_extras
-- =========================================================================
alter table public.vendor_profiles
  add column if not exists awards text[] default '{}',
  add column if not exists languages text[] default '{}',
  add column if not exists service_radius_km int,
  add column if not exists faq jsonb default '[]'::jsonb;

create table if not exists public.vendor_profile_extras (
  vendor_id uuid primary key references public.vendor_profiles(id) on delete cascade,
  press_mentions jsonb default '[]'::jsonb,
  certifications jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vendor_profile_extras enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='vendor_profile_extras' and policyname='Public read profile extras') then
    create policy "Public read profile extras" on public.vendor_profile_extras for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='vendor_profile_extras' and policyname='Vendor team manages extras') then
    create policy "Vendor team manages extras" on public.vendor_profile_extras for all
      using (public.is_vendor_member(vendor_id)) with check (public.is_vendor_member(vendor_id));
  end if;
end $$;

-- =========================================================================
-- 09: vendor_lead_rules
-- =========================================================================
create table if not exists public.vendor_lead_rules (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  name text not null,
  match_event_types text[] default '{}',
  min_budget_cents int,
  auto_reply_template text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.vendor_lead_rules enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='vendor_lead_rules' and policyname='Vendor team manages lead rules') then
    create policy "Vendor team manages lead rules" on public.vendor_lead_rules for all
      using (public.is_vendor_member(vendor_id)) with check (public.is_vendor_member(vendor_id));
  end if;
end $$;

create or replace function public.tg_apply_vendor_lead_rules()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  return new;
end$$;
drop trigger if exists trg_apply_vendor_lead_rules on public.inquiries;
create trigger trg_apply_vendor_lead_rules after insert on public.inquiries
  for each row execute function public.tg_apply_vendor_lead_rules();

-- =========================================================================
-- 10: group_channels + blog_bundles (3 tables)
-- =========================================================================
create table if not exists public.group_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_private boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.group_channels enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='group_channels' and policyname='Public read open channels') then
    create policy "Public read open channels" on public.group_channels for select using (not is_private or created_by = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='group_channels' and policyname='Authenticated create channels') then
    create policy "Authenticated create channels" on public.group_channels for insert with check (auth.uid() = created_by);
  end if;
end $$;

create table if not exists public.group_channel_members (
  channel_id uuid not null references public.group_channels(id) on delete cascade,
  user_id uuid not null,
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
alter table public.group_channel_members enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='group_channel_members' and policyname='Members read membership') then
    create policy "Members read membership" on public.group_channel_members for select using (user_id = auth.uid() or exists (select 1 from public.group_channels c where c.id=channel_id and c.created_by=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename='group_channel_members' and policyname='Self join channel') then
    create policy "Self join channel" on public.group_channel_members for insert with check (user_id = auth.uid());
  end if;
end $$;

create table if not exists public.blog_bundles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  article_ids uuid[] default '{}',
  cover_image_url text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.blog_bundles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='blog_bundles' and policyname='Public read published bundles') then
    create policy "Public read published bundles" on public.blog_bundles for select using (published_at is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename='blog_bundles' and policyname='Admins manage bundles') then
    create policy "Admins manage bundles" on public.blog_bundles for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

-- =========================================================================
-- 11: microsite_rsvps + 2 RPCs + columns
-- =========================================================================
alter table public.host_events
  add column if not exists microsite_rsvp_deadline date,
  add column if not exists microsite_rsvp_questions jsonb default '[]'::jsonb;

create table if not exists public.microsite_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.host_events(id) on delete cascade,
  guest_name text not null,
  guest_email text,
  status text not null check (status in ('attending','declined','maybe')),
  party_size int not null default 1,
  dietary text,
  answers jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.microsite_rsvps enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='microsite_rsvps' and policyname='Host views own microsite rsvps') then
    create policy "Host views own microsite rsvps" on public.microsite_rsvps for select
      using (exists (select 1 from public.host_events e where e.id = event_id and e.host_id = auth.uid()));
  end if;
end $$;

create or replace function public.get_microsite_rsvp_config(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_event record;
begin
  select id, name, microsite_rsvp_deadline, microsite_rsvp_questions, microsite_show_rsvp
    into v_event from public.host_events
    where microsite_token = p_token and microsite_published_at is not null;
  if v_event.id is null then return null; end if;
  return jsonb_build_object('event_id', v_event.id, 'event_name', v_event.name,
    'deadline', v_event.microsite_rsvp_deadline, 'questions', coalesce(v_event.microsite_rsvp_questions, '[]'::jsonb),
    'enabled', coalesce(v_event.microsite_show_rsvp, false));
end$$;

create or replace function public.submit_microsite_rsvp(
  p_token text, p_guest_name text, p_guest_email text, p_attending boolean,
  p_party_size int, p_dietary text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_event_id uuid;
begin
  select id into v_event_id from public.host_events
    where microsite_token = p_token and microsite_published_at is not null and coalesce(microsite_show_rsvp,false);
  if v_event_id is null then return jsonb_build_object('ok',false,'error','event_not_found'); end if;
  insert into public.microsite_rsvps (event_id, guest_name, guest_email, status, party_size, dietary, answers)
    values (v_event_id, p_guest_name, p_guest_email,
      case when p_attending then 'attending' else 'declined' end,
      coalesce(p_party_size,1), p_dietary, coalesce(p_answers,'{}'::jsonb));
  return jsonb_build_object('ok', true);
end$$;

-- =========================================================================
-- 12: proposal_view_tracking
-- =========================================================================
alter table public.proposals
  add column if not exists first_viewed_at timestamptz,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists view_count int not null default 0;

create or replace function public.mark_proposal_viewed(p_proposal_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.proposals
    set first_viewed_at = coalesce(first_viewed_at, now()),
        last_viewed_at = now(),
        view_count = view_count + 1
    where id = p_proposal_id;
end$$;

-- =========================================================================
-- 13: content_reports
-- =========================================================================
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewed','dismissed','actioned')),
  created_at timestamptz not null default now()
);
alter table public.content_reports enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='content_reports' and policyname='Authenticated submit reports') then
    create policy "Authenticated submit reports" on public.content_reports for insert with check (auth.uid() = reporter_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='content_reports' and policyname='Admins read reports') then
    create policy "Admins read reports" on public.content_reports for select using (public.is_admin() or reporter_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='content_reports' and policyname='Admins update reports') then
    create policy "Admins update reports" on public.content_reports for update using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

-- =========================================================================
-- 14: review_requests + 3 RPCs
-- =========================================================================
create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  host_id uuid not null,
  token text not null unique default replace(gen_random_uuid()::text,'-',''),
  message text,
  sent_at timestamptz not null default now(),
  submitted_at timestamptz
);
alter table public.review_requests enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='review_requests' and policyname='Vendor team manages review requests') then
    create policy "Vendor team manages review requests" on public.review_requests for all
      using (public.is_vendor_member(vendor_id)) with check (public.is_vendor_member(vendor_id));
  end if;
  if not exists (select 1 from pg_policies where tablename='review_requests' and policyname='Host can read own review requests') then
    create policy "Host can read own review requests" on public.review_requests for select using (host_id = auth.uid());
  end if;
end $$;

create or replace function public.send_review_request(p_inquiry_id uuid, p_vendor_id uuid, p_host_email text, p_message text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_host_id uuid; v_id uuid; v_token text;
begin
  if not public.is_vendor_member(p_vendor_id) then raise exception 'forbidden'; end if;
  select host_id into v_host_id from public.inquiries where id = p_inquiry_id;
  if v_host_id is null then raise exception 'inquiry not found'; end if;
  insert into public.review_requests (inquiry_id, vendor_id, host_id, message)
    values (p_inquiry_id, p_vendor_id, v_host_id, p_message)
    returning id, token into v_id, v_token;
  return jsonb_build_object('id', v_id, 'token', v_token);
end$$;

create or replace function public.get_review_request_context(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_req public.review_requests; v_vendor text;
begin
  select * into v_req from public.review_requests where token = p_token;
  if v_req.id is null then return null; end if;
  select business_name into v_vendor from public.vendor_profiles where id = v_req.vendor_id;
  return jsonb_build_object('inquiry_id', v_req.inquiry_id, 'vendor_id', v_req.vendor_id,
    'vendor_name', v_vendor, 'submitted_at', v_req.submitted_at, 'message', v_req.message);
end$$;

create or replace function public.submit_review_via_token(p_token text, p_rating int, p_title text, p_body text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_req public.review_requests; v_review_id uuid;
begin
  select * into v_req from public.review_requests where token = p_token;
  if v_req.id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_req.submitted_at is not null then return jsonb_build_object('ok',false,'error','already_submitted'); end if;
  insert into public.reviews (inquiry_id, vendor_id, host_id, rating, title, body)
    values (v_req.inquiry_id, v_req.vendor_id, v_req.host_id, p_rating, p_title, p_body)
    returning id into v_review_id;
  update public.review_requests set submitted_at = now() where id = v_req.id;
  return jsonb_build_object('ok', true, 'review_id', v_review_id);
end$$;

-- =========================================================================
-- 15: host_inquiry_templates
-- =========================================================================
create table if not exists public.host_inquiry_templates (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null,
  name text not null,
  body text not null,
  event_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.host_inquiry_templates enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='host_inquiry_templates' and policyname='Host manages own inquiry templates') then
    create policy "Host manages own inquiry templates" on public.host_inquiry_templates for all
      using (host_id = auth.uid()) with check (host_id = auth.uid());
  end if;
end $$;
drop trigger if exists trg_host_inquiry_templates_updated on public.host_inquiry_templates;
create trigger trg_host_inquiry_templates_updated before update on public.host_inquiry_templates
  for each row execute function public.tg_set_updated_at();

-- =========================================================================
-- 16: message_attachments columns
-- =========================================================================
alter table public.messages
  add column if not exists attachment_paths text[] default '{}',
  add column if not exists attachment_metadata jsonb default '[]'::jsonb;

-- =========================================================================
-- 17: vendor_policies columns
-- =========================================================================
alter table public.vendor_profiles
  add column if not exists cancellation_policy text,
  add column if not exists deposit_policy text,
  add column if not exists payment_terms text;

-- =========================================================================
-- 18: proposal_templates
-- =========================================================================
create table if not exists public.proposal_templates (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  name text not null,
  intro text,
  line_items jsonb default '[]'::jsonb,
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.proposal_templates enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='proposal_templates' and policyname='Vendor team manages proposal templates') then
    create policy "Vendor team manages proposal templates" on public.proposal_templates for all
      using (public.is_vendor_member(vendor_id)) with check (public.is_vendor_member(vendor_id));
  end if;
end $$;
drop trigger if exists trg_proposal_templates_updated on public.proposal_templates;
create trigger trg_proposal_templates_updated before update on public.proposal_templates
  for each row execute function public.tg_set_updated_at();

-- =========================================================================
-- 19: notification_prefs column
-- =========================================================================
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{"email":true,"push":true,"in_app":true}'::jsonb;

-- =========================================================================
-- 20: proposal_share_token + 2 RPCs
-- =========================================================================
alter table public.proposals
  add column if not exists share_token text unique,
  add column if not exists share_enabled boolean not null default false;

create or replace function public.toggle_proposal_share(p_proposal_id uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_vendor uuid; v_token text;
begin
  select vendor_id into v_vendor from public.proposals where id = p_proposal_id;
  if v_vendor is null then raise exception 'proposal not found'; end if;
  if not public.is_vendor_member(v_vendor) then raise exception 'forbidden'; end if;
  if p_enabled then
    update public.proposals
      set share_enabled = true,
          share_token = coalesce(share_token, replace(gen_random_uuid()::text,'-',''))
      where id = p_proposal_id
      returning share_token into v_token;
  else
    update public.proposals set share_enabled = false where id = p_proposal_id;
  end if;
  return jsonb_build_object('ok', true, 'token', v_token, 'enabled', p_enabled);
end$$;

create or replace function public.get_proposal_by_share_token(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_p public.proposals; v_vendor_name text; v_host_name text;
begin
  select * into v_p from public.proposals where share_token = p_token and share_enabled = true;
  if v_p.id is null then return null; end if;
  select business_name into v_vendor_name from public.vendor_profiles where id = v_p.vendor_id;
  select coalesce(display_name,'Host') into v_host_name from public.profiles where id = v_p.host_id;
  return jsonb_build_object('proposal', to_jsonb(v_p), 'vendor_name', v_vendor_name, 'host_name', v_host_name);
end$$;
