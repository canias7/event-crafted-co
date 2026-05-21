-- Idempotency support for MCP write tools (send_reply primarily).
-- Stores the key alongside the existing call-log row + the result
-- message id so a retried call with the same key returns the
-- original message instead of inserting a duplicate.

alter table public.mcp_call_log
  add column if not exists idempotency_key text,
  add column if not exists result_message_id uuid;

-- Lookup index for the "have I seen this key recently?" check.
-- Partial index keeps it small — only rows that actually used a key.
create index if not exists mcp_call_log_idempotency_idx
  on public.mcp_call_log (user_id, tool_name, idempotency_key, created_at desc)
  where idempotency_key is not null;
