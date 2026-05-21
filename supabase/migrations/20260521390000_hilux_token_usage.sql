-- HILUX token-usage tracking. Adds Anthropic API token counts to
-- hilux_action_log so vendors can see what HILUX has cost them.
-- All four numbers come straight from the Anthropic usage object;
-- pricing is applied client-side so we don't bake it into the DB.

alter table public.hilux_action_log
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists cache_creation_tokens integer,
  add column if not exists cache_read_tokens integer;
