-- Imported reviews: vendors paste/import their existing reviews from
-- Knot / Yelp / Google so they don't start from zero on Vendora.
-- Marked as imported so we can label them as such in the UI (anti-
-- fooling-the-host transparency).
--
-- Imported reviews don't link to a Vendora inquiry (they pre-date
-- platform), so the schema is separate from `reviews`. Aggregate
-- rating displays should pull from both tables.

create table public.imported_reviews (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  source text not null check (source in ('knot','yelp','google','wedding_wire','facebook','other')),
  reviewer_name text not null,
  rating numeric(2,1) not null check (rating >= 1 and rating <= 5),
  body text,
  reviewed_at date,
  -- We don't claim these are auto-verified — vendor pastes them. Honest
  -- "imported from {source}" badge in the UI.
  created_at timestamptz not null default now()
);

create index imported_reviews_vendor_idx
  on public.imported_reviews (vendor_id, reviewed_at desc, created_at desc);

alter table public.imported_reviews enable row level security;

-- Public read: surfaces on the vendor's profile page.
create policy "imported_reviews public read"
  on public.imported_reviews for select using (true);

create policy "imported_reviews member insert"
  on public.imported_reviews for insert to authenticated
  with check (public.is_vendor_member(vendor_id));

create policy "imported_reviews member update"
  on public.imported_reviews for update to authenticated
  using (public.is_vendor_member(vendor_id));

create policy "imported_reviews member delete"
  on public.imported_reviews for delete to authenticated
  using (public.is_vendor_member(vendor_id));
