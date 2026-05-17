-- Track when the vendor first opened an inquiry thread so the inbox
-- row can show an unread indicator. NULL = vendor hasn't opened it
-- yet. Backfill leaves existing rows unread so the dot lights up for
-- inquiries that landed before this column existed — vendor opens
-- once, mark read, dot disappears.

alter table public.inquiries
  add column if not exists vendor_read_at timestamptz;

create index if not exists inquiries_vendor_id_vendor_read_at_idx
  on public.inquiries (vendor_id, vendor_read_at);
