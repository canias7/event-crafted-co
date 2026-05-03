-- Event registry hub: hosts add their registry links (Amazon, Crate &
-- Barrel, Zola, Honeyfund, charity, custom) and we surface them as a
-- single shareable page. We don't host the registry — just curate the
-- links so guests have one URL to send to friends.
--
-- Each row is one provider entry per host. Order is editable.

create table public.event_registry_links (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,        -- 'amazon' | 'crate-barrel' | 'zola' | 'honeyfund' | 'charity' | 'other'
  label text not null,           -- display name, e.g. "Our home essentials"
  url text not null,             -- registry URL
  description text,              -- optional one-liner
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_registry_links_host_idx
  on public.event_registry_links (host_id, display_order, created_at);

alter table public.event_registry_links enable row level security;

-- Host + planning collaborators see the registry; editors can manage it.
-- (is_planning_collaborator + is_planning_editor were added in the
-- planning_collaborators migration and treat host_id = auth.uid() as
-- automatic owner.)
create policy "event_registry_links collaborator select"
  on public.event_registry_links for select to authenticated
  using (public.is_planning_collaborator(host_id));
create policy "event_registry_links editor insert"
  on public.event_registry_links for insert to authenticated
  with check (public.is_planning_editor(host_id));
create policy "event_registry_links editor update"
  on public.event_registry_links for update to authenticated
  using (public.is_planning_editor(host_id));
create policy "event_registry_links editor delete"
  on public.event_registry_links for delete to authenticated
  using (public.is_planning_editor(host_id));

-- Public lookup by host_id token-of-sorts. We don't have a separate
-- public-share token here — guests reach the registry via the host's
-- existing RSVP link or invitation flow. Skip public RLS for now;
-- can add later if standalone share is needed.

create trigger event_registry_links_updated
  before update on public.event_registry_links
  for each row execute function public.tg_set_updated_at();
