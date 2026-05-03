-- Vendor SEO slug: human-readable URL at /v/<slug> as a mirror of the
-- existing /vendors/<id> page. Vendor-controlled, lowercase, hyphenated.
--
-- Backfill seeds slugs from business_name with collision suffixes.
-- New rows get a slug via trigger if the vendor doesn't pick one. The
-- /v/<slug> route does a slug → id lookup then renders the standard
-- detail page. SEO meta on that page already uses useDocumentMeta so
-- canonical + og:url pick up the slug URL automatically.

alter table public.vendor_profiles
  add column if not exists slug text unique;

-- Lowercase / strip non-alphanum / collapse hyphens. Tail-trim.
create or replace function public.slugify_vendor_name(p_name text)
returns text
language sql immutable
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g'
    )
  )
$$;

-- Backfill existing vendors. Append -<short-id> on collision.
do $$
declare
  r record;
  v_base text;
  v_candidate text;
  v_n int;
begin
  for r in
    select id, business_name
    from public.vendor_profiles
    where slug is null
  loop
    v_base := public.slugify_vendor_name(r.business_name);
    if v_base = '' then
      v_base := 'vendor';
    end if;
    v_candidate := v_base;
    v_n := 1;
    while exists (
      select 1 from public.vendor_profiles
      where slug = v_candidate and id <> r.id
    ) loop
      v_n := v_n + 1;
      if v_n > 5 then
        -- Final fallback: append short id slice
        v_candidate := v_base || '-' || substring(r.id::text, 1, 6);
        exit;
      end if;
      v_candidate := v_base || '-' || v_n::text;
    end loop;
    update public.vendor_profiles
    set slug = v_candidate
    where id = r.id;
  end loop;
end$$;

-- Auto-slug on insert when the vendor doesn't pick one. Mirrors the
-- backfill collision logic.
create or replace function public.tg_set_vendor_slug()
returns trigger
language plpgsql
as $$
declare
  v_base text;
  v_candidate text;
  v_n int;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;
  v_base := public.slugify_vendor_name(new.business_name);
  if v_base = '' then
    v_base := 'vendor';
  end if;
  v_candidate := v_base;
  v_n := 1;
  while exists (
    select 1 from public.vendor_profiles
    where slug = v_candidate
  ) loop
    v_n := v_n + 1;
    if v_n > 5 then
      v_candidate := v_base || '-' || substring(new.id::text, 1, 6);
      exit;
    end if;
    v_candidate := v_base || '-' || v_n::text;
  end loop;
  new.slug := v_candidate;
  return new;
end$$;

drop trigger if exists vendor_profiles_set_slug on public.vendor_profiles;
create trigger vendor_profiles_set_slug
  before insert on public.vendor_profiles
  for each row execute function public.tg_set_vendor_slug();
