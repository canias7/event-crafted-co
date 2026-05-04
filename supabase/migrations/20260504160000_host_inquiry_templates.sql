-- Host inquiry templates: hosts save reusable message bodies for
-- reaching out to vendors. Mirrors what vendors already have via
-- vendor_templates. Big UX win on multi-vendor inquiry blasts —
-- hosts no longer retype "100 ppl, Aug 2026, modern, $25k" 10x.

create table public.host_inquiry_templates (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  body text not null,
  is_default boolean not null default false,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index host_inquiry_templates_host_idx
  on public.host_inquiry_templates (host_id, is_default desc, name);

-- Only one default per host.
create unique index host_inquiry_templates_one_default_idx
  on public.host_inquiry_templates (host_id)
  where is_default = true;

alter table public.host_inquiry_templates enable row level security;

create policy "host_inquiry_templates owner all"
  on public.host_inquiry_templates for all
  to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

-- Trigger keeps updated_at fresh + enforces single-default.
create or replace function public.host_inquiry_templates_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.is_default then
    update public.host_inquiry_templates
    set is_default = false
    where host_id = new.host_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

create trigger host_inquiry_templates_touch
  before insert or update on public.host_inquiry_templates
  for each row execute function public.host_inquiry_templates_touch();
