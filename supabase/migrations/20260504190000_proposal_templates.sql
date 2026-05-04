-- Reusable proposal templates: vendor saves a proposal body
-- (line items + deposit pct + terms text) so similar inquiries
-- can be turned into proposals in 2 clicks instead of 5 minutes
-- of retyping.
--
-- Mirrors host_inquiry_templates / vendor_templates patterns.

create table public.proposal_templates (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  name text not null,
  title text not null,
  line_items jsonb not null default '[]'::jsonb,
  -- We store deposit as a percentage (0-100); the proposal form
  -- converts to cents at the moment of send based on current
  -- subtotal. This way templates stay sensible across price tiers.
  deposit_pct integer
    check (deposit_pct is null or (deposit_pct >= 0 and deposit_pct <= 100)),
  terms text,
  is_default boolean not null default false,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index proposal_templates_vendor_idx
  on public.proposal_templates (vendor_id, is_default desc, name);

create unique index proposal_templates_one_default_idx
  on public.proposal_templates (vendor_id)
  where is_default = true;

alter table public.proposal_templates enable row level security;

create policy "proposal_templates vendor all"
  on public.proposal_templates for all
  to authenticated
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

create or replace function public.proposal_templates_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.is_default then
    update public.proposal_templates
    set is_default = false
    where vendor_id = new.vendor_id
      and id <> new.id
      and is_default;
  end if;
  return new;
end;
$$;

create trigger proposal_templates_touch
  before insert or update on public.proposal_templates
  for each row execute function public.proposal_templates_touch();
