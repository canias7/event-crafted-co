-- VendoraPay payment links. Vendor creates a "$X for Y" link,
-- shares the URL, the host pays via Stripe Checkout (hosted) and
-- vendorapay-webhook stamps the link paid via metadata.payment_link_id.
--
-- Slug is the URL-safe public id ("/pay/link/<slug>"). Random 12-char
-- string; collisions are vanishingly rare at this length.

create table if not exists public.payment_links (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  slug text not null unique default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  title text not null,
  description text,
  amount_cents integer not null check (amount_cents >= 50),
  currency text not null default 'usd',
  status text not null default 'active' check (status in ('active', 'paid', 'cancelled', 'expired')),
  expires_at timestamptz,
  paid_at timestamptz,
  paid_payment_intent_id text,
  host_email text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_links_vendor_created_idx
  on public.payment_links(vendor_id, created_at desc);
create index if not exists payment_links_slug_idx
  on public.payment_links(slug);

alter table public.payment_links enable row level security;

drop policy if exists "payment_links team read" on public.payment_links;
create policy "payment_links team read"
  on public.payment_links for select
  using (public.is_vendor_member(vendor_id));

drop policy if exists "payment_links admin insert" on public.payment_links;
create policy "payment_links admin insert"
  on public.payment_links for insert
  with check (public.is_vendor_team_admin(vendor_id) and created_by = auth.uid());

drop policy if exists "payment_links admin update" on public.payment_links;
create policy "payment_links admin update"
  on public.payment_links for update
  using (public.is_vendor_team_admin(vendor_id));

-- Public lookup for the checkout page. SECURITY DEFINER so it works
-- without auth — exposes only the fields the checkout UI renders.
create or replace function public.get_payment_link_for_checkout(p_slug text)
returns table (
  id uuid,
  vendor_id uuid,
  title text,
  description text,
  amount_cents integer,
  currency text,
  status text,
  vendor_business_name text,
  vendor_logo_url text
) language sql stable security definer set search_path = public as $$
  select
    pl.id,
    pl.vendor_id,
    pl.title,
    pl.description,
    pl.amount_cents,
    pl.currency,
    pl.status,
    vp.business_name,
    vp.logo_url
  from public.payment_links pl
  join public.vendor_profiles vp on vp.id = pl.vendor_id
  where pl.slug = p_slug
    and pl.status = 'active'
    and (pl.expires_at is null or pl.expires_at > now())
  limit 1;
$$;

grant execute on function public.get_payment_link_for_checkout(text) to anon, authenticated;
