-- Inquiry intake form: vendor publishes a structured RFP-style form
-- (one or more questions) hosts fill out instead of (or in addition
-- to) free-text special_requests. Answers stored as a jsonb map on
-- the inquiry so the vendor sees structured data in their inbox.
--
-- Schema kept simple — single row per vendor, list of questions in
-- a jsonb array. Each question has: id, label, type (text|number|
-- select|multiselect|yesno), options (for select), required.

create table public.vendor_intake_forms (
  vendor_id uuid primary key references public.vendor_profiles(id) on delete cascade,
  intro text,
  questions jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendor_intake_forms enable row level security;

-- Public read on published forms only — anonymous hosts see them when
-- they open the inquiry modal.
create policy "vendor_intake_forms public read published"
  on public.vendor_intake_forms for select
  using (is_published = true);

create policy "vendor_intake_forms member read all"
  on public.vendor_intake_forms for select to authenticated
  using (public.is_vendor_member(vendor_id));

create policy "vendor_intake_forms member upsert"
  on public.vendor_intake_forms for insert to authenticated
  with check (public.is_vendor_member(vendor_id));

create policy "vendor_intake_forms member update"
  on public.vendor_intake_forms for update to authenticated
  using (public.is_vendor_member(vendor_id));

create policy "vendor_intake_forms member delete"
  on public.vendor_intake_forms for delete to authenticated
  using (public.is_vendor_member(vendor_id));

create trigger vendor_intake_forms_updated
  before update on public.vendor_intake_forms
  for each row execute function public.tg_set_updated_at();

-- Inquiry side: store the host's answers as a jsonb map { questionId: value }.
alter table public.inquiries
  add column if not exists intake_answers jsonb;
