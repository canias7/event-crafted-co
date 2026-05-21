-- Remove the custom-greeting + reply-length controls from HILUX.
-- The greeting was a free-text first-reply opener; reply length was
-- a short/medium/long target. Both are dropped — HILUX now always
-- writes its own opener and targets a fixed medium length.

alter table public.profiles drop column if exists hilux_greeting_line;
alter table public.profiles drop column if exists hilux_reply_length;
