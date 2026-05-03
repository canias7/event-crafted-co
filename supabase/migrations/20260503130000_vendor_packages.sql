-- Vendor pricing packages: multiple service tiers per vendor (e.g. "Half-day
-- coverage — $2,500", "Full-day — $4,500", "Full-day + album — $6,200").
-- Replaces the single base_price_cents pattern with concrete offerings hosts
-- can browse and reference when sending an inquiry. base_price_cents is
-- kept on vendor_profiles as the fallback for vendors who haven't built
-- out their packages yet.

create table public.vendor_packages (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  includes jsonb not null default '[]'::jsonb,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendor_packages_vendor_idx
  on public.vendor_packages (vendor_id, display_order, created_at);

create index vendor_packages_active_idx
  on public.vendor_packages (vendor_id, is_active, price_cents)
  where is_active = true;

alter table public.vendor_packages enable row level security;

-- Public read on active packages (directory + detail pages need this for
-- anonymous visitors). Vendor team sees their own inactive ones too.
create policy "vendor_packages public read active"
  on public.vendor_packages for select
  using (is_active = true);

create policy "vendor_packages member read all"
  on public.vendor_packages for select
  to authenticated
  using (public.is_vendor_member(vendor_id));

create policy "vendor_packages member insert"
  on public.vendor_packages for insert
  to authenticated
  with check (public.is_vendor_member(vendor_id));

create policy "vendor_packages member update"
  on public.vendor_packages for update
  to authenticated
  using (public.is_vendor_member(vendor_id));

create policy "vendor_packages member delete"
  on public.vendor_packages for delete
  to authenticated
  using (public.is_vendor_member(vendor_id));

create trigger vendor_packages_updated
  before update on public.vendor_packages
  for each row execute function public.tg_set_updated_at();
