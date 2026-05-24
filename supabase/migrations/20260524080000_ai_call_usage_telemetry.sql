-- Per-call AI usage log. One row per upstream API call (Anthropic
-- message, OpenAI image, etc). Lets us replace list-price math with
-- actual COGS once volume picks up — and catch regressions like the
-- cache-hit rate dropping (a Claude pricing change that suddenly
-- makes the prompt-cache write more expensive than the read).
--
-- Distinct from vendor_credit_transactions: that tracks what the
-- VENDOR paid in credits; this tracks what WE paid in dollars to the
-- upstream. There's a 1:N relationship — one credit-consume can
-- trigger multiple API calls (e.g. hilux_reply makes a main Claude
-- call + a lead-score side call).

create table public.ai_call_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  -- 'hilux_reply' (matches credit_action) or sub-call name
  -- ('hilux_reply_lead_score', 'axion_image', etc).
  action_type text not null,
  -- 'anthropic' | 'openai' | 'mux' — coarse routing for
  -- aggregations. Model holds the specific identifier.
  provider text not null,
  model text not null,
  -- Anthropic-shaped tokens. cache_creation includes the system
  -- prompt the first time it's seen in the 5-min window; cache_read
  -- on every subsequent call.
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  -- Image-priced calls (OpenAI gpt-image-1) report N images rather
  -- than tokens. Zero for Claude rows.
  image_count integer not null default 0,
  -- Snapshotted dollar cost in micro-dollars (USD * 1,000,000).
  -- Computed at write time so pricing changes don't retroactively
  -- rewrite history. Sum + divide by 1e6 to get dollars.
  cost_micros bigint not null default 0,
  -- Optional join to the user-facing artifact (inquiry id, thread
  -- id, gallery image id). Helps trace cost back to "what produced
  -- this charge".
  ref_id text,
  -- false when the upstream call failed AFTER we'd already decided
  -- to log (e.g. partial response, timeout). Useful for "what % of
  -- our cost is on calls that produced nothing".
  success boolean not null default true,
  error_message text
);

-- Hot-path indexes: per-user recent calls (dashboards), per-action
-- aggregates (cost reports), daily rollups (top-line charts).
create index ai_call_usage_user_created_idx
  on public.ai_call_usage (user_id, created_at desc);
create index ai_call_usage_action_created_idx
  on public.ai_call_usage (action_type, created_at desc);
create index ai_call_usage_created_idx
  on public.ai_call_usage (created_at desc);

alter table public.ai_call_usage enable row level security;

-- Service-role only. Per-user reporting can happen via a server-
-- side function later (avoids exposing the cost column to clients,
-- which is competitive info we don't want leaking).
create policy "ai_call_usage_no_public_access" on public.ai_call_usage
  for all to public using (false) with check (false);

comment on table public.ai_call_usage is
  'Per-call AI usage log. cost_micros = USD × 1e6, snapshotted at write time.';
