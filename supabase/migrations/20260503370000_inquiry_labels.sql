-- Vendor inbox labels: per-vendor custom tags applied to inquiries
-- (e.g. "Hot lead", "Follow up", "Holiday season", "Out of scope").
-- Layered on top of the existing status workflow — labels are
-- vendor-defined, status is the platform-wide pipeline state.
--
-- Labels are vendor-scoped (each vendor has their own set). Inquiries
-- are tagged via a join table so an inquiry can carry multiple labels.

create table public.vendor_inquiry_labels (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  name text not null,
  -- Hex color (with #) for the chip background. Lightweight palette.
  color text not null default '#a08259',
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (vendor_id, lower(name))
);

create index vendor_inquiry_labels_vendor_idx
  on public.vendor_inquiry_labels (vendor_id, display_order);

alter table public.vendor_inquiry_labels enable row level security;

create policy "vendor_inquiry_labels member select"
  on public.vendor_inquiry_labels for select to authenticated
  using (public.is_vendor_member(vendor_id));

create policy "vendor_inquiry_labels member insert"
  on public.vendor_inquiry_labels for insert to authenticated
  with check (public.is_vendor_member(vendor_id));

create policy "vendor_inquiry_labels member update"
  on public.vendor_inquiry_labels for update to authenticated
  using (public.is_vendor_member(vendor_id));

create policy "vendor_inquiry_labels member delete"
  on public.vendor_inquiry_labels for delete to authenticated
  using (public.is_vendor_member(vendor_id));

create table public.inquiry_label_assignments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  label_id uuid not null references public.vendor_inquiry_labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (inquiry_id, label_id)
);

create index inquiry_label_assignments_inquiry_idx
  on public.inquiry_label_assignments (inquiry_id);

create index inquiry_label_assignments_label_idx
  on public.inquiry_label_assignments (label_id);

alter table public.inquiry_label_assignments enable row level security;

-- Vendor team members of the inquiry's vendor can read + write assignments.
-- Looking up the inquiry's vendor_id requires going through a SECURITY
-- DEFINER helper so we don't recurse into RLS on inquiries.
create or replace function public.is_inquiry_vendor_member(_inquiry_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.inquiries i
    join public.vendor_team_members m
      on m.vendor_id = i.vendor_id and m.user_id = auth.uid()
    where i.id = _inquiry_id
  )
$$;

grant execute on function public.is_inquiry_vendor_member(uuid) to authenticated;

create policy "inquiry_label_assignments vendor select"
  on public.inquiry_label_assignments for select to authenticated
  using (public.is_inquiry_vendor_member(inquiry_id));

create policy "inquiry_label_assignments vendor insert"
  on public.inquiry_label_assignments for insert to authenticated
  with check (public.is_inquiry_vendor_member(inquiry_id));

create policy "inquiry_label_assignments vendor delete"
  on public.inquiry_label_assignments for delete to authenticated
  using (public.is_inquiry_vendor_member(inquiry_id));
