-- HILUX V1.10: custom greeting line + reply length preference.
--
-- greeting_line: free-text opener HILUX uses on first reply in a
--   thread (e.g. "Hey there! Thanks for reaching out — "). Null
--   means HILUX uses its own opener.
-- reply_length: short / medium / long. Tunes the system prompt's
--   "X short sentences" target. Default 'medium' matches the
--   existing 2-4 sentence behaviour.

alter table public.profiles
  add column if not exists hilux_greeting_line text,
  add column if not exists hilux_reply_length text not null default 'medium'
    check (hilux_reply_length in ('short', 'medium', 'long'));
