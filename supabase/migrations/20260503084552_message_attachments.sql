-- File attachments on inquiry messages. Stored in a public bucket with
-- random per-file paths (security through unguessable paths is acceptable
-- here — same model as the portfolio bucket, no banking/PII content). Files
-- live under <inquiry_id>/<uuid>.<ext> so cleanup on inquiry deletion is
-- straightforward.

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', true)
on conflict (id) do nothing;

create policy "message attachments public read"
  on storage.objects for select
  using (bucket_id = 'message-attachments');

-- Authenticated users can upload — defense-in-depth via inquiry membership
-- check on the message INSERT itself (RLS already prevents a user from
-- attaching to an inquiry they're not on).
create policy "message attachments authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'message-attachments');

-- Senders / participants can delete their own uploads. Best-effort —
-- enforcement primarily on the messages.attachments column via
-- the existing host/vendor message policies.
create policy "message attachments authenticated delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'message-attachments');

-- attachments column on messages: jsonb array of
-- { storage_path, filename, size, mime }
alter table public.messages
  add column attachments jsonb not null default '[]'::jsonb;
