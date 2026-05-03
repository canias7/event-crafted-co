
-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'host' check (role in ('host','vendor','admin')),
  display_name text,
  avatar_url text,
  preferred_language text not null default 'en',
  phone text,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles select own" on public.profiles for select using (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);

-- vendor_profiles
create table public.vendor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  business_name text not null,
  category text not null,
  bio text,
  base_price_cents integer,
  location text,
  service_radius_miles integer,
  portfolio_summary text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vendor_profiles enable row level security;

create policy "vendor_profiles select authed" on public.vendor_profiles for select to authenticated using (true);
create policy "vendor_profiles insert own" on public.vendor_profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "vendor_profiles update own" on public.vendor_profiles for update to authenticated using (auth.uid() = user_id);

-- inquiries
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  event_type text not null check (event_type in ('wedding','birthday','holiday_dinner','other')),
  event_date date,
  guest_count integer,
  location text,
  budget_min_cents integer,
  budget_max_cents integer,
  special_requests text,
  status text not null default 'new' check (status in ('new','drafted','replied','won','lost','expired')),
  quality_score integer,
  intent_score integer,
  recommended_verification text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inquiries_vendor_status_created_idx on public.inquiries (vendor_id, status, created_at desc);
alter table public.inquiries enable row level security;

-- helper function: does current user own this vendor_profile?
create or replace function public.is_vendor_owner(_vendor_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.vendor_profiles vp
    where vp.id = _vendor_id and vp.user_id = auth.uid()
  )
$$;

create policy "inquiries host select" on public.inquiries for select using (auth.uid() = host_id);
create policy "inquiries host insert" on public.inquiries for insert with check (auth.uid() = host_id);
create policy "inquiries host update" on public.inquiries for update using (auth.uid() = host_id);
create policy "inquiries vendor select" on public.inquiries for select using (public.is_vendor_owner(vendor_id));
create policy "inquiries vendor update" on public.inquiries for update using (public.is_vendor_owner(vendor_id));

-- messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  sender_id uuid references public.profiles(id),
  sender_role text not null check (sender_role in ('host','vendor','agent')),
  body text not null,
  is_draft boolean not null default false,
  draft_status text check (draft_status in ('pending_approval','approved','edited','discarded')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_inquiry_created_idx on public.messages (inquiry_id, created_at);
alter table public.messages enable row level security;

create or replace function public.can_access_inquiry(_inquiry_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.inquiries i
    left join public.vendor_profiles vp on vp.id = i.vendor_id
    where i.id = _inquiry_id
      and (i.host_id = auth.uid() or vp.user_id = auth.uid())
  )
$$;

create policy "messages select participants" on public.messages for select using (public.can_access_inquiry(inquiry_id));
create policy "messages host insert" on public.messages for insert with check (
  sender_role = 'host' and sender_id = auth.uid()
  and exists (select 1 from public.inquiries i where i.id = inquiry_id and i.host_id = auth.uid())
);
create policy "messages vendor insert" on public.messages for insert with check (
  sender_role = 'vendor' and sender_id = auth.uid()
  and exists (
    select 1 from public.inquiries i join public.vendor_profiles vp on vp.id = i.vendor_id
    where i.id = inquiry_id and vp.user_id = auth.uid()
  )
);
create policy "messages vendor update own thread" on public.messages for update using (
  exists (
    select 1 from public.inquiries i join public.vendor_profiles vp on vp.id = i.vendor_id
    where i.id = messages.inquiry_id and vp.user_id = auth.uid()
  )
);

-- ai_agent_runs
create table public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  agent_name text not null,
  model text,
  prompt_version text,
  status text not null check (status in ('success','error','aborted')),
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  tool_calls jsonb not null default '[]'::jsonb,
  output text,
  error text,
  started_at timestamptz,
  completed_at timestamptz
);
alter table public.ai_agent_runs enable row level security;

create policy "ai_agent_runs vendor select" on public.ai_agent_runs for select using (
  exists (
    select 1 from public.inquiries i join public.vendor_profiles vp on vp.id = i.vendor_id
    where i.id = ai_agent_runs.inquiry_id and vp.user_id = auth.uid()
  )
);

-- updated_at triggers
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;$$;

create trigger profiles_updated before update on public.profiles for each row execute function public.tg_set_updated_at();
create trigger vendor_profiles_updated before update on public.vendor_profiles for each row execute function public.tg_set_updated_at();
create trigger inquiries_updated before update on public.inquiries for each row execute function public.tg_set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'host'),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
