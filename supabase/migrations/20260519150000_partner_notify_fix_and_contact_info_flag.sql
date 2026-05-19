-- Vendor↔vendor (Partners) messaging fixes:
--
-- 1. notify_partner_message() referenced sender_vendor_id /
--    vendor_a_id / vendor_b_id — columns that became NULL when the
--    schema flipped to user-keyed threads in 20260517140000. Result:
--    v_recipient_vendor resolved to NULL on every insert, the fanout
--    loop returned 0 rows, no notification was ever created. Rewrite
--    to use sender_user_id / user_a_id / user_b_id directly.
-- 2. Same trigger linked notifications to /vendor/messages — a route
--    that was retired when VendorMessagesPage was deleted. Point at
--    /vendor/partners?thread=… instead.
-- 3. Add vendor_partner_messages.contact_info_flagged + a BEFORE
--    INSERT trigger that does a coarse regex for email / phone
--    patterns. Mirrors what direct_messages.contact_info_flagged
--    was intended for. The UI will surface a small warning on
--    flagged outgoing messages so vendors know it was detected.

create or replace function public.notify_partner_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_thread record;
  v_recipient_user uuid;
  v_sender_name text;
begin
  select * into v_thread from public.vendor_partner_threads
   where id = new.thread_id;
  if v_thread.id is null then
    return new;
  end if;

  -- Pick the OPPOSITE side as the recipient. user_a/b_id are the
  -- canonical participant columns post-20260517140000.
  v_recipient_user :=
    case
      when new.sender_user_id = v_thread.user_a_id then v_thread.user_b_id
      when new.sender_user_id = v_thread.user_b_id then v_thread.user_a_id
      else null
    end;
  if v_recipient_user is null then
    return new;
  end if;

  -- Sender's display name. Fall back to "Another vendor" so the
  -- notification body always makes sense.
  select coalesce(
    (select business_name
       from public.vendor_profiles
      where user_id = new.sender_user_id
        and business_name is not null
      order by created_at asc
      limit 1),
    'Another vendor'
  ) into v_sender_name;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_recipient_user,
    'vendor_partner_message',
    v_sender_name || ' sent you a message',
    substring(new.body for 140),
    '/vendor/partners?thread=' || new.thread_id::text
  );

  return new;
end
$$;

-- ─── Contact-info flag on partner messages ──────────────────────────
alter table public.vendor_partner_messages
  add column if not exists contact_info_flagged boolean not null default false;

create or replace function public.tg_flag_partner_contact_info()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  -- Coarse email + phone detection. Email RE: word + @ + domain.
  -- Phone RE: 7 or more digit-ish chars in a row (with common
  -- separators). False positives are acceptable for a soft signal;
  -- the UI doesn't BLOCK, just nudges.
  new.contact_info_flagged :=
    new.body ~* '\m\w[\w.+-]*@[\w-]+(\.[\w-]+)+\M'
    or new.body ~ '(?:\+?\d[\s.\-]?){7,}';
  return new;
end
$$;

drop trigger if exists vendor_partner_messages_flag_contact_info
  on public.vendor_partner_messages;
create trigger vendor_partner_messages_flag_contact_info
  before insert on public.vendor_partner_messages
  for each row
  execute function public.tg_flag_partner_contact_info();
