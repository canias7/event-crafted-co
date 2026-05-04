-- Direct message attachments: lets host/vendor share inspiration
-- photos, menu PDFs, contracts, etc. inline in the post-booking
-- direct_messages thread (the inquiry messages table already has
-- attachments — see 20260503084552; we reuse the same bucket and
-- the same security-through-unguessable-path model).
--
-- attachments shape (jsonb array — same as inquiry messages):
--   [{ storage_path: string, filename: string, size: number, mime: string }]

alter table public.direct_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Body becomes optional when there's at least one attachment. Drop
-- the original body-non-empty constraint and replace with one that
-- allows empty body iff attachments has items.
alter table public.direct_messages
  drop constraint if exists direct_messages_body_check;

alter table public.direct_messages
  add constraint direct_messages_body_or_attachment_check
  check (
    length(trim(body)) > 0
    or jsonb_array_length(attachments) > 0
  );
