-- Three audit-flagged security fixes for the messaging stack:
--
-- 1. message-attachments storage was wide-open: any signed-in user
--    could INSERT or DELETE any file in the bucket. Tighten the
--    policies so writes are gated on participation in the inquiry
--    (web path scheme) or self-ownership of the prefix (mobile path
--    scheme), and deletes are limited to the original uploader.
--
-- 2. inquiries.{vendor_read_at, host_read_at} were UPDATE-able by
--    either party — a host could fake "Seen by vendor" or keep an
--    inquiry permanently unread in the vendor's inbox. Add a BEFORE
--    UPDATE trigger that pins the OPPOSITE party's read pointer to
--    its OLD value, only for direct client updates. Internal
--    triggers (the clear-on-opposite-send pair) are allowed through
--    via pg_trigger_depth() > 1.
--
-- 3. tg_direct_messages_touch_edited_at had no fixed search_path —
--    flagged by the security advisor. Rewrite with
--    set search_path = 'public'.

-- ─── 1. Tighten storage policies for message-attachments ────────────
-- Path schemes in use:
--   • web:    "<inquiry_id>/<uuid>.<ext>"
--             (lib/messageAttachments.ts → uploadAttachments(..., inquiryId))
--   • mobile: "<auth.uid>/<thread_id>/<ts-rand>.<ext>"
--             (apps/*-mobile/.../thread/[id].tsx)
-- The INSERT check accepts either: own-prefix uploads OR
-- participants-of-the-inquiry uploads. DELETE is sender-only via
-- the standard storage.objects.owner column.

drop policy if exists "message attachments authenticated insert" on storage.objects;
drop policy if exists "message attachments authenticated delete" on storage.objects;

create policy "message attachments participants insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or exists (
        select 1
          from public.inquiries i
         where i.id::text = split_part(name, '/', 1)
           and (
             (select auth.uid()) = i.host_id
             or is_vendor_member(i.vendor_id)
           )
      )
    )
  );

create policy "message attachments owner delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and owner = (select auth.uid())
  );

-- ─── 2. Lock inquiry read-pointer columns ──────────────────────────
-- Inside the BEFORE UPDATE trigger we silently reset the opposite
-- party's read pointer to its OLD value if the caller is the wrong
-- role, so the legitimate single-field update still goes through
-- without an error toast — the bad write just doesn't stick.

create or replace function public.tg_inquiries_lock_read_pointers()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  -- Nested trigger update: trust it. The clear-on-opposite-send
  -- pair (tg_clear_*_read_on_*_message) directly nulls the
  -- opposite side's pointer; that needs to pass through here.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- Host (auth.uid() = host_id): write host_read_at only.
  if (select auth.uid()) = new.host_id then
    new.vendor_read_at := old.vendor_read_at;
  end if;

  -- Vendor (any team member of vendor_id): write vendor_read_at only.
  if is_vendor_member(new.vendor_id) then
    new.host_read_at := old.host_read_at;
  end if;

  return new;
end
$$;

drop trigger if exists inquiries_lock_read_pointers on public.inquiries;
create trigger inquiries_lock_read_pointers
  before update on public.inquiries
  for each row
  execute function public.tg_inquiries_lock_read_pointers();

-- ─── 3. Pin search_path on touch_edited_at ─────────────────────────
create or replace function public.tg_direct_messages_touch_edited_at()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if new.body is distinct from old.body
     or new.attachments is distinct from old.attachments then
    new.edited_at := now();
  end if;
  return new;
end
$$;
