-- Attachments column on my_space_messages so the chatbox can carry
-- images / PDFs alongside text. Shape per element:
--   { url: string, mime: string, name: string, size?: number }
alter table public.my_space_messages
  add column if not exists attachments jsonb;
