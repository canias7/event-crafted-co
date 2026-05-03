-- Guests + RSVP
create table public.event_guests (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, email text, phone text,
  plus_one_allowed boolean not null default false,
  group_label text,
  invitation_token text unique not null default encode(gen_random_bytes(16), 'hex'),
  rsvp_status text check (rsvp_status in ('attending','declined','maybe')),
  rsvp_plus_one boolean, rsvp_dietary text, rsvp_message text,
  rsvp_responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_guests_host_idx on public.event_guests (host_id, created_at desc);
alter table public.event_guests enable row level security;
create policy "event_guests host all" on public.event_guests for all to authenticated using (auth.uid() = host_id) with check (auth.uid() = host_id);
create trigger event_guests_updated before update on public.event_guests for each row execute function public.tg_set_updated_at();

create or replace function public.get_guest_by_token(p_token text)
returns table (id uuid, name text, plus_one_allowed boolean, rsvp_status text, rsvp_plus_one boolean, rsvp_dietary text, rsvp_message text, host_name text, event_type text, event_date date, event_location text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.plus_one_allowed, g.rsvp_status, g.rsvp_plus_one, g.rsvp_dietary, g.rsvp_message,
    p.display_name, p.event_type, p.event_date, p.event_location
  from public.event_guests g join public.profiles p on p.id = g.host_id
  where g.invitation_token = p_token
$$;
grant execute on function public.get_guest_by_token(text) to anon, authenticated;

create or replace function public.submit_rsvp(p_token text, p_status text, p_plus_one boolean, p_dietary text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('attending','declined','maybe') then raise exception 'Invalid status'; end if;
  update public.event_guests set rsvp_status = p_status, rsvp_plus_one = p_plus_one,
    rsvp_dietary = nullif(trim(p_dietary), ''), rsvp_message = nullif(trim(p_message), ''),
    rsvp_responded_at = now() where invitation_token = p_token;
  if not found then raise exception 'Invitation not found'; end if;
end$$;
grant execute on function public.submit_rsvp(text, text, boolean, text, text) to anon, authenticated;

-- Vendor message templates
create table public.vendor_message_templates (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  name text not null, body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vendor_message_templates_vendor_idx on public.vendor_message_templates (vendor_id, name);
alter table public.vendor_message_templates enable row level security;
create policy "vendor_message_templates owner all" on public.vendor_message_templates for all to authenticated
  using (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()))
  with check (exists (select 1 from public.vendor_profiles vp where vp.id = vendor_id and vp.user_id = auth.uid()));
create trigger vendor_message_templates_updated before update on public.vendor_message_templates for each row execute function public.tg_set_updated_at();

-- Multi-event
create table public.host_events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  event_type text not null check (event_type in ('wedding','birthday','holiday_dinner','other')),
  event_date date, event_location text,
  budget_min_cents integer, budget_max_cents integer, event_notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index host_events_host_idx on public.host_events (host_id, archived_at, created_at desc);
alter table public.host_events enable row level security;
create policy "host_events host all" on public.host_events for all to authenticated using (auth.uid() = host_id) with check (auth.uid() = host_id);
create trigger host_events_updated before update on public.host_events for each row execute function public.tg_set_updated_at();
alter table public.profiles add column active_event_id uuid references public.host_events(id) on delete set null;

with new_events as (
  insert into public.host_events (host_id, event_type, event_date, event_location, budget_min_cents, budget_max_cents, event_notes, created_at, updated_at)
  select p.id, p.event_type, p.event_date, p.event_location, p.budget_min_cents, p.budget_max_cents, p.event_notes,
    coalesce(p.onboarded_at, p.created_at), p.updated_at
  from public.profiles p where p.event_type is not null
  returning id, host_id
)
update public.profiles p set active_event_id = ne.id from new_events ne where p.id = ne.host_id;

-- Featured events CMS
create table public.featured_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, title text not null,
  event_type text not null, event_type_label text,
  location text, hosts text, guests integer, date_label text,
  excerpt text, body text, hero_url text,
  vendor_credits jsonb not null default '[]'::jsonb,
  published_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index featured_events_published_idx on public.featured_events (published_at desc) where published_at is not null;
alter table public.featured_events enable row level security;
create policy "featured_events public read" on public.featured_events for select using (published_at is not null);
create policy "featured_events admin all" on public.featured_events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger featured_events_updated before update on public.featured_events for each row execute function public.tg_set_updated_at();