-- Host-posted reviews + vendor responses for booked inquiries.
-- Two tables on purpose: lets RLS scope writes per-role without column-level
-- permissions. Host owns reviews row; vendor owns response row.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null unique references public.inquiries(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reviews_vendor_idx on public.reviews (vendor_id, created_at desc);
create index reviews_host_idx on public.reviews (host_id);

alter table public.reviews enable row level security;

create policy "reviews public read"
  on public.reviews for select using (true);

-- Host can only post a review for their own inquiry, and only when the
-- inquiry is marked won (booked). Prevents review-bombing of vendors who
-- declined or never booked.
create policy "reviews host insert"
  on public.reviews for insert
  to authenticated
  with check (
    auth.uid() = host_id
    and exists (
      select 1 from public.inquiries i
      where i.id = inquiry_id
        and i.host_id = auth.uid()
        and i.status = 'won'
    )
  );

create policy "reviews host update own"
  on public.reviews for update
  to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create policy "reviews host delete own"
  on public.reviews for delete
  to authenticated
  using (auth.uid() = host_id);

create trigger reviews_updated
  before update on public.reviews
  for each row execute function public.tg_set_updated_at();

-- Vendor's response. Separate table so the vendor can write without the
-- ability to modify the host's rating/body via RLS.
create table public.review_responses (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.review_responses enable row level security;

create policy "review_responses public read"
  on public.review_responses for select using (true);

create policy "review_responses vendor insert"
  on public.review_responses for insert
  to authenticated
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create policy "review_responses vendor update"
  on public.review_responses for update
  to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create policy "review_responses vendor delete"
  on public.review_responses for delete
  to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );

create trigger review_responses_updated
  before update on public.review_responses
  for each row execute function public.tg_set_updated_at();
