-- Featured event editorial entries managed by admin. Page falls back to the
-- bundled TS data for slugs not yet in the DB so the existing 6 entries
-- keep rendering until the team replaces them with real content.

create table public.featured_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  event_type text not null,
  event_type_label text,
  location text,
  hosts text,
  guests integer,
  date_label text,
  excerpt text,
  body text,
  hero_url text,
  vendor_credits jsonb not null default '[]'::jsonb,
  published_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index featured_events_published_idx
  on public.featured_events (published_at desc)
  where published_at is not null;

alter table public.featured_events enable row level security;

create policy "featured_events public read"
  on public.featured_events for select
  using (published_at is not null);

create policy "featured_events admin all"
  on public.featured_events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create trigger featured_events_updated
  before update on public.featured_events
  for each row execute function public.tg_set_updated_at();
