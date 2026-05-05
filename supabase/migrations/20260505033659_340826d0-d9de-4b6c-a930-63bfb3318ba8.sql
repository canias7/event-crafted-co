create table public.real_events (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  slug text unique,
  title text not null,
  intro text,
  story text,
  cover_path text,
  gallery_paths text[] not null default '{}',
  event_type text check (event_type in ('wedding','birthday','holiday_dinner','other') or event_type is null),
  event_date date,
  location text,
  host_consent_given_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index real_events_vendor_idx on public.real_events (vendor_id, created_at desc);
create index real_events_published_idx on public.real_events (published_at desc nulls last)
  where published_at is not null and host_consent_given_at is not null;

alter table public.real_events enable row level security;

create policy "real_events public read" on public.real_events for select
  using (published_at is not null and host_consent_given_at is not null);
create policy "real_events vendor team read" on public.real_events for select to authenticated
  using (public.is_vendor_member(vendor_id));
create policy "real_events vendor team insert" on public.real_events for insert to authenticated
  with check (public.is_vendor_member(vendor_id));
create policy "real_events vendor team update" on public.real_events for update to authenticated
  using (public.is_vendor_member(vendor_id));
create policy "real_events vendor team delete" on public.real_events for delete to authenticated
  using (public.is_vendor_member(vendor_id));

create trigger real_events_updated before update on public.real_events
  for each row execute function public.tg_set_updated_at();

create or replace function public.generate_real_event_slug(p_title text, p_id uuid)
returns text language plpgsql immutable as $$
declare v_base text;
begin
  v_base := lower(regexp_replace(p_title, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  if length(v_base) > 60 then v_base := substring(v_base for 60); end if;
  if v_base = '' then v_base := 'event'; end if;
  return v_base || '-' || substr(replace(p_id::text, '-', ''), 1, 6);
end$$;