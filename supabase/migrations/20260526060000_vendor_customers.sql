-- Customer records per vendor listing. Each row is one person the
-- vendor has billed (or plans to bill). Lets vendors keep a list
-- they can re-bill from with one click and gives future surfaces
-- (per-customer invoice history, "Top customers" reporting) a
-- canonical join key (email + vendor).
--
-- Owner-only RLS — no cross-vendor reads, no anon visibility.

create table if not exists public.vendor_customers (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  email text not null,
  name text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, email)
);

create index if not exists vendor_customers_vendor_id_idx
  on public.vendor_customers (vendor_id, created_at desc);

alter table public.vendor_customers enable row level security;

drop policy if exists "vendor_customers owner read" on public.vendor_customers;
create policy "vendor_customers owner read" on public.vendor_customers
  for select
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_customers.vendor_id
        and vp.user_id = auth.uid()
    )
  );

drop policy if exists "vendor_customers owner write" on public.vendor_customers;
create policy "vendor_customers owner write" on public.vendor_customers
  for all
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_customers.vendor_id
        and vp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_customers.vendor_id
        and vp.user_id = auth.uid()
    )
  );

create or replace function public.vendor_customers_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vendor_customers_touch_trg on public.vendor_customers;
create trigger vendor_customers_touch_trg
  before update on public.vendor_customers
  for each row execute function public.vendor_customers_touch();
