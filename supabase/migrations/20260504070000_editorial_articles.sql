-- Editorial article CMS — long-form guides, city deep-dives, vendor
-- spotlights. Each row is a permanent SEO landing page at /guides/{slug}
-- with a hero image + markdown body + optional category / city /
-- event-type tags so we can cross-link from the corresponding
-- programmatic SEO pages.
--
-- This is the content layer that makes the programmatic-page engine
-- actually work for SEO — Google's E-E-A-T signals reward sites with
-- hand-written editorial copy plus structured data, not just empty
-- result pages. The articles drive in-bound links to the marketplace.
--
-- Schema choices:
--   - body stored as plain markdown text; rendered with react-markdown
--   - category / city / event_type tags are slugs (denormalized) so
--     cross-linking is just a join-free lookup
--   - published_at gates public visibility; drafts are admin-only
--   - hero_path is a storage path in a new editorial-images bucket

create table public.editorial_articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text,
  excerpt text,                          -- card preview / og:description
  body text not null,                    -- markdown
  hero_path text,                        -- storage path in editorial-images
  -- Faceting tags. Each is a slug matching the URL conventions used
  -- elsewhere (e.g. category_slug = 'photographers' matches
  -- /vendors/category/photographers).
  category_slug text,
  city_slug text,
  event_type_slug text,
  author_name text,                      -- byline; can differ from
                                         -- the auth.uid() author
  author_id uuid references public.profiles(id) on delete set null,
  read_minutes int not null default 5,   -- estimated read time
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index editorial_articles_slug_idx on public.editorial_articles (slug);
create index editorial_articles_published_idx
  on public.editorial_articles (published_at desc nulls last)
  where published_at is not null;
create index editorial_articles_category_idx
  on public.editorial_articles (category_slug)
  where category_slug is not null;
create index editorial_articles_city_idx
  on public.editorial_articles (city_slug)
  where city_slug is not null;
create index editorial_articles_event_type_idx
  on public.editorial_articles (event_type_slug)
  where event_type_slug is not null;

alter table public.editorial_articles enable row level security;

-- Public read of published articles only.
create policy "editorial_articles public read"
  on public.editorial_articles for select
  using (published_at is not null);

-- Admins can read drafts + write everything.
create policy "editorial_articles admin all"
  on public.editorial_articles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create trigger editorial_articles_updated
  before update on public.editorial_articles
  for each row execute function public.tg_set_updated_at();

-- Storage bucket for hero images.
insert into storage.buckets (id, name, public)
  values ('editorial-images', 'editorial-images', true)
  on conflict (id) do nothing;

create policy "editorial images public read"
  on storage.objects for select
  using (bucket_id = 'editorial-images');

create policy "editorial images admin write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'editorial-images' and public.is_admin());

create policy "editorial images admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'editorial-images' and public.is_admin());

create policy "editorial images admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'editorial-images' and public.is_admin());
