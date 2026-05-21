-- HILUX typing indicator. Edge function sets this to ~30s in the
-- future when it starts processing a host message; clears it when
-- the reply is posted (or the run skips/errors). The host UI
-- subscribes to direct_threads and shows "HILUX is typing..." while
-- the value is in the future.

alter table public.direct_threads
  add column if not exists hilux_typing_until timestamptz;
