-- Vendor saved reply templates. Vendors compose once, reuse across inquiries.
-- When the AI agent ships, these become the strongest voice signal we have
-- for tone-matching their replies.

create table public.vendor_message_templates (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendor_message_templates_vendor_idx
  on public.vendor_message_templates (vendor_id, name);

alter table public.vendor_message_templates enable row level security;

create policy "vendor_message_templates owner all"
  on public.vendor_message_templates
  for all to authenticated
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

create trigger vendor_message_templates_updated
  before update on public.vendor_message_templates
  for each row execute function public.tg_set_updated_at();
