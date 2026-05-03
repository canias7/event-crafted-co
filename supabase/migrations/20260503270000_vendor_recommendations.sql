-- Vendor preferred recommendations: a vendor (typically a venue) curates
-- a list of trusted vendors they've worked with. Surfaces on the
-- recommender's public detail page as "Vendors we love" — gives hosts
-- a starting point and gives the recommender a discoverable network
-- effect.
--
-- Self-recommendation is blocked at the policy level; admin can clean up
-- spam recommendations later via a moderation column if needed.

create table public.vendor_recommendations (
  id uuid primary key default gen_random_uuid(),
  recommender_id uuid not null references public.vendor_profiles(id) on delete cascade,
  recommended_id uuid not null references public.vendor_profiles(id) on delete cascade,
  note text,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (recommender_id, recommended_id),
  check (recommender_id <> recommended_id)
);

create index vendor_recommendations_recommender_idx
  on public.vendor_recommendations (recommender_id, display_order, created_at);

create index vendor_recommendations_recommended_idx
  on public.vendor_recommendations (recommended_id);

alter table public.vendor_recommendations enable row level security;

-- Public read so recommendations show on detail pages to anonymous
-- visitors.
create policy "vendor_recommendations public read"
  on public.vendor_recommendations for select using (true);

-- Vendor team members can manage their own vendor's recommendations.
create policy "vendor_recommendations member insert"
  on public.vendor_recommendations for insert to authenticated
  with check (public.is_vendor_member(recommender_id));

create policy "vendor_recommendations member update"
  on public.vendor_recommendations for update to authenticated
  using (public.is_vendor_member(recommender_id));

create policy "vendor_recommendations member delete"
  on public.vendor_recommendations for delete to authenticated
  using (public.is_vendor_member(recommender_id));
