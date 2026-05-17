-- Re-light the inbox unread dot when the host sends a follow-up
-- message after the vendor has already opened the thread. Mirrors
-- iMessage: a new incoming message brings the dot back.
--
-- Fires only when the new direct_message is from a HOST (a vendor's
-- own reply shouldn't relight their own dot) and the thread is tied
-- to an inquiry (DM-without-inquiry threads don't carry a
-- vendor_read_at to clear).

create or replace function public.tg_clear_vendor_read_on_host_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inquiry_id uuid;
begin
  if new.sender_role <> 'host' then
    return new;
  end if;
  select inquiry_id into v_inquiry_id
    from public.direct_threads
   where id = new.thread_id;
  if v_inquiry_id is null then
    return new;
  end if;
  update public.inquiries
     set vendor_read_at = null
   where id = v_inquiry_id
     and vendor_read_at is not null;
  return new;
end
$$;

drop trigger if exists direct_messages_clear_vendor_read on public.direct_messages;
create trigger direct_messages_clear_vendor_read
  after insert on public.direct_messages
  for each row
  execute function public.tg_clear_vendor_read_on_host_message();
