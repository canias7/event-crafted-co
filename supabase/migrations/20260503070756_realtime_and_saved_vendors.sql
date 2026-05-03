-- Realtime publication for inquiry conversations.
-- Without this, supabase.channel().on('postgres_changes', ...) for
-- inquiries / messages silently delivers no events.

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.inquiries;

-- saved_vendors — a host's "wishlist" of vendors. Composite PK prevents
-- duplicate saves. RLS restricts each host to managing only their own rows.

create table public.saved_vendors (
  host_id uuid not null references public.profiles(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (host_id, vendor_id)
);

create index saved_vendors_host_idx on public.saved_vendors (host_id, created_at desc);

alter table public.saved_vendors enable row level security;

create policy "saved_vendors host select"
  on public.saved_vendors for select
  using (auth.uid() = host_id);

create policy "saved_vendors host insert"
  on public.saved_vendors for insert
  with check (auth.uid() = host_id);

create policy "saved_vendors host delete"
  on public.saved_vendors for delete
  using (auth.uid() = host_id);
