-- Spec response cache for flatlay-generate. An identical (model + system
-- prompt + request) reuses the LLM's spec output instead of paying for another
-- Anthropic call. Internal only — the edge function (service role) reads/writes;
-- no public policies, so anon/authenticated have no access.
create table if not exists public.flatlay_spec_cache (
  prompt_hash text primary key,
  spec        jsonb not null,
  model       text,
  created_at  timestamptz not null default now()
);

alter table public.flatlay_spec_cache enable row level security;
