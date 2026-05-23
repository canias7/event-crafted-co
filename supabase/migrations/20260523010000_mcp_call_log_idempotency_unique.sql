-- Replace the plain idempotency index on mcp_call_log with a UNIQUE
-- one. Two concurrent send_reply calls with the same idempotency
-- key would both see "no prior" in the existing check and both
-- insert log rows. The unique constraint makes the second insert
-- fail at the DB layer, so we never end up with duplicate log
-- entries for the same key. Partial (WHERE idempotency_key IS NOT
-- NULL) so the bulk of call_log rows (non-idempotent tools) aren't
-- forced to be unique on a null column.
--
-- Note: this guards the call_log itself. The deeper message-
-- duplication race in send_reply (two concurrent invocations both
-- writing a direct_message before either logs) is a separate fix
-- that requires moving the claim ahead of the work — tracked for a
-- follow-up.

drop index if exists public.mcp_call_log_idempotency_idx;

create unique index mcp_call_log_idempotency_unique
  on public.mcp_call_log (user_id, idempotency_key)
  where idempotency_key is not null;
