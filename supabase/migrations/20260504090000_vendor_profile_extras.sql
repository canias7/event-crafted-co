-- Three small additions to vendor_profiles + a new vendor_faqs table:
--
-- 1. instagram_handle / tiktok_handle: connect vendor's social to
--    auto-render their latest posts on the public profile.
-- 2. vendor_faqs: structured Q&A for FAQPage rich-result eligibility.
--    Each vendor maintains their own; we render with FAQPage JSON-LD.
--
-- All public-readable; vendor-owner-write.

alter table public.vendor_profiles
  add column if not exists instagram_handle text,
  add column if not exists tiktok_handle text;

create table if not exists public.vendor_faqs (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  question text not null,
  answer text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index vendor_faqs_vendor_idx
  on public.vendor_faqs (vendor_id, display_order, created_at);

alter table public.vendor_faqs enable row level security;

create policy "vendor_faqs public read"
  on public.vendor_faqs for select using (true);

create policy "vendor_faqs owner write"
  on public.vendor_faqs for all to authenticated
  using (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vendor_profiles vp
      where vp.id = vendor_id and vp.user_id = auth.uid()
    )
  );
